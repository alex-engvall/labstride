import { loadExtension, freezeProfile, ExtensionError } from '../extensions/loader.ts';
import type { HostProfile, Profile } from '../extensions/loader.ts';
import type { RecordOf } from '../core/lifecycle.ts';
import type { ActionAdapter, BoundResult } from '../core/execution.ts';
import type { ConfigurationSnapshot } from '../configuration/snapshot.ts';
import { checkedSnapshot } from '../configuration/snapshot.ts';
import { validated } from '../storage-sqlite/validation.ts';
import { digest } from '../storage-sqlite/execution.ts';
import { runtimeAction, runtimeVersion, runtimeNamespace } from '../target-helper/runtime-contracts.ts';
import type { RuntimeRequest, RuntimeResponse, RuntimeInput } from '../target-helper/runtime-contracts.ts';
export interface RuntimeConnector {
  validate(request:RuntimeRequest):Promise<void>;
  invoke(request:RuntimeRequest):Promise<RuntimeResponse>;
}
export function runtimeTargetResolver(host:HostProfile) {
  const instances=new Map<string,Promise<RuntimeConnector>>();
  return {resolve(profile:Profile):Promise<RuntimeConnector> {
    const key=digest(profile);let instance=instances.get(key);
    if(!instance) {
      instance=(async()=>{
        if(profile.pin.id!=='labstride.connector.ssh'||profile.pin.kind!=='connector')throw new ExtensionError('identity_mismatch');
        const loaded=await loadExtension(profile,host),raw=loaded.instance as RuntimeConnector;
        if(typeof raw?.validate!=='function'||typeof raw?.invoke!=='function')throw new ExtensionError('validation_failed');
        const validate=async(request:RuntimeRequest)=>{
          validated('ssh-runtime-request',request);loaded.checkInput(request);
          if(!profile.capabilities.includes(`runtime.${request.method}.v1`))throw new ExtensionError('unsupported_capability');
          await raw.validate(request);
        };
        return {validate,async invoke(request:RuntimeRequest) {
          await validate(request);
          const reply=validated('ssh-runtime-response',await raw.invoke(structuredClone(request)));loaded.checkOutput(reply);
          for(const field of ['schemaVersion','requestId','installationId','targetId','targetRevision','method'] as const)
            if(reply[field]!==request[field])throw new ExtensionError('identity_mismatch');
          if(reply.runtime&&request.operation) {
            const op=request.operation,input=op.inputs as unknown as RuntimeInput,r=reply.runtime;
            const expected={installationId:request.installationId,targetId:op.targetId,targetRevision:request.targetRevision,
              operationId:op.operationId,handle:op.operationId,runId:op.runId,workspaceId:op.workspaceId,requestDigest:op.requestDigest,
              workspaceOperationId:input.workspaceOperationId,recipe:input.recipe,namespace:runtimeNamespace(request.installationId,op.targetId,op.workspaceId,input.recipe)};
            for(const field of Object.keys(expected) as (keyof typeof expected)[])
              if(digest(r[field])!==digest(expected[field]))throw new ExtensionError('identity_mismatch');
            if(new Set(r.resources.map(x=>x.name)).size!==r.resources.length||r.resources.some(x=>!x.name.startsWith(r.namespace+'-')))throw new ExtensionError('identity_mismatch');
          }
          return reply;
        }};
      })();instances.set(key,instance);instance.catch(()=>instances.delete(key));
    }
    return instance;
  }};
}
export function configuredRuntimeAction(store:{runConfiguration(runId:string):ConfigurationSnapshot|null;get<K extends 'workspace'|'operation'>(kind:K,id:string):RecordOf<K>},host:HostProfile):ActionAdapter {
  const connectors=runtimeTargetResolver(host),actions=new Map<string,Promise<ActionAdapter>>();
  const binding=async(op:RecordOf<'operation'>['request'])=>{
    const saved=store.runConfiguration(op.runId);if(!saved)throw new ExtensionError('configuration_invalid');
    const snapshot=checkedSnapshot(saved),target=snapshot.configuration.targets[op.targetId];
    const connector=snapshot.extensionLock.extensions.find(pin=>pin.id===target?.connector&&pin.kind==='connector');
    const action=snapshot.extensionLock.extensions.find(pin=>pin.id===op.actionId&&pin.version===op.actionVersion&&pin.kind==='action');
    if(op.configDigest!==snapshot.digest||op.actionId!==runtimeAction||op.actionVersion!==runtimeVersion||!target||!connector||!action)throw new ExtensionError('identity_mismatch');
    const input=validated('runtime-create-input',op.inputs as unknown as RuntimeInput),workspace=store.get('workspace',op.workspaceId),source=store.get('operation',input.workspaceOperationId);
    if(input.target!==op.targetId||workspace.runId!==op.runId||workspace.targetId!==op.targetId||!['ready','in_use','retained'].includes(workspace.state)||
      source.runId!==op.runId||source.workspaceId!==op.workspaceId||source.state!=='succeeded'||source.request.actionId!=='labstride.workspace-create'||
      source.request.inputs.rootId!==input.rootId||digest(source.request.source)!==digest(op.source))throw new ExtensionError('identity_mismatch');
    const revision=target.configuration.revision;if(typeof revision!=='number')throw new ExtensionError('configuration_invalid');
    return {installationId:snapshot.configuration.installationId,targetRevision:revision,
      profile:freezeProfile(op.runId,snapshot.digest,{...connector,configuration:target.configuration},host),
      actionProfile:freezeProfile(op.runId,snapshot.digest,action,host),action,snapshot};
  };
  const resolve=async(op:RecordOf<'operation'>['request'])=>{
    const original=await binding(op),key=digest([op.runId,original.action]);let action=actions.get(key);
    if(!action) {
      action=(async()=>{
        const runtime={
          async binding(operation:RecordOf<'operation'>['request']) {const b=await binding(operation);return{installationId:b.installationId,targetRevision:b.targetRevision};},
          async validate(request:RuntimeRequest) {
            const b=await binding(request.operation!),connector=await connectors.resolve(b.profile);await connector.validate(request);
            const probe=await connector.invoke({schemaVersion:'3.0',requestId:request.requestId,installationId:b.installationId,
              targetId:request.targetId,targetRevision:b.targetRevision,method:'probe'});
            if(probe.outcome!=='ok'||!['runtime.create.v1','runtime.inspect.v1'].every(c=>probe.capabilities.some(actual=>actual===c)))throw new ExtensionError('unsupported_capability');
          },
          async invoke(request:RuntimeRequest) {const b=await binding(request.operation!);return(await connectors.resolve(b.profile)).invoke(request);},
        };
        const loaded=await loadExtension(original.actionProfile,host,{runtime}),instance=loaded.instance as ActionAdapter;
        if(typeof instance?.validate!=='function'||typeof instance?.start!=='function'||typeof instance?.reconcile!=='function')throw new ExtensionError('validation_failed');
        const check=(result:BoundResult)=>{loaded.checkOutput(result);return validated('execution-record',result) as BoundResult;};
        return {async validate(operation){loaded.checkInput(operation.inputs);await instance.validate(operation);},
          async start(operation,claim){return check(await instance.start(operation,claim));},async reconcile(operation,handle){return check(await instance.reconcile(operation,handle));}};
      })();actions.set(key,action);action.catch(()=>actions.delete(key));
    }
    return action;
  };
  return {async validate(op){await(await resolve(op)).validate(op);},async start(op,claim){return(await resolve(op)).start(op,claim);},async reconcile(op,handle){return(await resolve(op)).reconcile(op,handle);}};
}
