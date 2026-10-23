import {createSessionAction,sessionAction,sessionActionVersion} from '../core/sessions.ts';
import type {SessionCommandPort,SessionProvider} from '../core/sessions.ts';
import type {ActionAdapter,BoundResult} from '../core/execution.ts';
import type {RecordOf} from '../core/lifecycle.ts';
import type {ConfigurationSnapshot} from '../configuration/snapshot.ts';
import {checkedSnapshot} from '../configuration/snapshot.ts';
import {loadExtension,freezeProfile,ExtensionError} from './loader.ts';
import type {HostProfile,Profile} from './loader.ts';
import {digest} from '../storage-sqlite/execution.ts';
import {validated} from '../storage-sqlite/validation.ts';
// Managed runs must pin the action as well as the session provider. Legacy
// unconfigured sessions retain their original trusted embedding behavior.
export function installedSessionAction(store:SessionCommandPort&{runConfiguration(runId:string):ConfigurationSnapshot|null},host:HostProfile,
  resolve:(profile:Profile)=>Promise<SessionProvider>):ActionAdapter {
  const service=createSessionAction(store,resolve),instances=new Map<string,Promise<ActionAdapter>>();
  async function action(op:RecordOf<'operation'>['request']):Promise<ActionAdapter> {
    const saved=store.runConfiguration(op.runId);if(!saved)return service;
    const snapshot=checkedSnapshot(saved),pin=snapshot.extensionLock.extensions.find(pin=>pin.id===sessionAction&&pin.version===sessionActionVersion&&pin.kind==='action');
    if(!pin||op.configDigest!==snapshot.digest)throw new ExtensionError('identity_mismatch');
    const profile=freezeProfile(op.runId,snapshot.digest,pin,host),key=digest(profile);let instance=instances.get(key);
    if(!instance){instance=(async()=>{
      const loaded=await loadExtension(profile,host,{sessionAction:service}),raw=loaded.instance as ActionAdapter;
      if(typeof raw?.validate!=='function'||typeof raw?.start!=='function'||typeof raw?.reconcile!=='function'||raw.atomicSessionGuards!==true)throw new ExtensionError('identity_mismatch');
      return {atomicSessionGuards:true,async validate(operation){loaded.checkInput(operation.inputs);await raw.validate(operation);},
        async start(operation,claim,guard){const result=await raw.start(operation,claim,guard);loaded.checkOutput(result);return validated<BoundResult>('execution-record',result);},
        async reconcile(operation,handle){const result=await raw.reconcile(operation,handle);loaded.checkOutput(result);return validated<BoundResult>('execution-record',result);}};
    })();instances.set(key,instance);instance.catch(()=>instances.delete(key));}
    return instance;
  }
  return {atomicSessionGuards:true,async validate(op){await(await action(op)).validate(op);},async start(op,claim,guard){return(await action(op)).start(op,claim,guard);},
    async reconcile(op,handle){return(await action(op)).reconcile(op,handle);}};
}
