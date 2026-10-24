import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { runtimeFixture } from './helpers/runtime-fixture.mjs';
import { startCoordinator } from '../apps/coordinator/main.ts';
import { createWorker, actionKey } from '../packages/core/worker.ts';
import { loadExtension, freezeProfile } from '../packages/extensions/loader.ts';
import { WorkspaceRegistry } from '../packages/target-helper/workspaces.ts';
import { prepareWorkspaceStart } from '../packages/connector-ssh/workspaces.ts';
import { startPlan, seed, eventInput, context } from './helpers/execution-fixture.mjs';
import { requestDigest } from '../packages/storage-sqlite/execution.ts';
import { configurationFixture } from './helpers/configuration-fixture.mjs';
import { configuredRuntimeAction } from '../packages/connector-ssh/runtimes.ts';
async function fixture(t,{lost=false}={}) {
  const f=await runtimeFixture(t),registry=f.open(),source=new WorkspaceRegistry(f.policy);t.after(()=>{registry.close();source.close();});
  const host={protocol:{major:1,minor:0},permissions:['filesystem.workspace','network.ssh'],capabilities:[]};
  async function pin(directory) {
    const path=join(f.root,directory.split('/').pop()+'.artifact.json');execFileSync(process.execPath,['scripts/package_extension.mjs',directory,path]);
    const artifact=JSON.parse(readFileSync(path,'utf8'));
    return {id:artifact.manifest.id,version:artifact.manifest.version,kind:artifact.manifest.kind,artifactPath:path,
      integrity:createHash('sha256').update(readFileSync(path)).digest('hex'),permissions:artifact.manifest.permissions,capabilities:artifact.manifest.capabilities,configuration:{}};
  }
  const runtimePin=await pin('packages/action-runtime-create'),sourcePin=await pin('packages/action-workspace-create');
  const sourceLoaded=await loadExtension(freezeProfile(f.operation.runId,f.operation.configDigest,sourcePin,host),host,{target:{
    async binding(){return{installationId:f.policy.installationId,revision:1};},async validate(){},invoke:req=>source.handle(req)}});
  let creates=0,inspects=0;
  const runtimeLoaded=await loadExtension(freezeProfile(f.operation.runId,f.operation.configDigest,runtimePin,host),host,{runtime:{
    async binding(){return{installationId:f.policy.installationId,targetRevision:1};},async validate(){},async invoke(req){
      if(req.method==='create')creates++;else inspects++;
      const response=await registry.handle(req);if(lost&&req.method==='create')throw Error('discard real reply');return response;
    }}});
  const adapters=new Map([[actionKey(sourcePin.id,sourcePin.version),sourceLoaded.instance],[actionKey(runtimePin.id,runtimePin.version),runtimeLoaded.instance]]);
  const state=join(f.root,'coordinator');let runtime=startCoordinator(state);seed(runtime.store);t.after(()=>runtime.store.close());
  const plan=startPlan();plan.operation.request=f.operation;plan.workspace.targetId=f.policy.targetId;plan.run.repositoryId=f.operation.source.repositoryId;plan.projections=[];
  const prepared=prepareWorkspaceStart(plan,f.policy.installationId);runtime.store.scheduleStart(runtime.store.receive(eventInput()).id,prepared,context);
  const worker=()=>createWorker(runtime.store,{executorId:'runtime-worker',nextAttempt:()=>crypto.randomUUID(),adapters});
  let w=worker();await w.tick();await w.drain();assert.equal(runtime.store.get('workspace',f.operation.workspaceId).state,'ready');
  const op=f.operationFor(),operation={...plan.operation,id:op.operationId,request:op},outbox={...plan.outbox,id:'runtime-outbox',operationId:op.operationId,intentKey:'runtime-create',payload:{schemaVersion:'1.0',operationId:op.operationId}};
  const scheduled={operation,outbox,resourceKey:'runtime:'+op.workspaceId+':'+op.inputs.recipe.id};runtime.store.scheduleOperation(scheduled,context);
  return {...f,host,runtimePin,sourcePin,scheduled,worker,loaded:runtimeLoaded,store:()=>runtime.store,creates:()=>creates,inspects:()=>inspects,
    restart(){runtime.store.close();runtime=startCoordinator(state);return runtime.store;}};
}
test('public pinned runtime action uses normal claims/effect boundary and transactional resource inventory',async t=>{
  const f=await fixture(t),worker=f.worker();await worker.tick();await worker.drain();
  const store=f.store();assert.equal(store.get('operation',f.scheduled.operation.id).state,'succeeded');
  const resources=store.snapshot().records.filter(r=>r.kind==='resource');assert.equal(resources.length,2);
  const runtime=resources.find(r=>r.resourceType==='database');assert.equal(runtime.createdByOperation,f.scheduled.operation.id);assert.equal(runtime.workspaceId,f.operation.workspaceId);assert.equal(runtime.cleanupPolicy,'retain');
  assert.equal(f.creates(),1);assert.equal(f.inspects(),0);
});
test('lost real recipe reply and coordinator restart inspect one original operation and preserve its resource inventory',async t=>{
  const f=await fixture(t,{lost:true});let worker=f.worker();await worker.tick();await worker.drain();assert.equal(f.store().get('operation',f.scheduled.operation.id).state,'outcome_unknown');
  const store=f.restart();assert.equal(store.scheduleOperation(f.scheduled,context),f.scheduled.operation.id);
  worker=f.worker();await worker.tick();await worker.drain();assert.equal(store.get('operation',f.scheduled.operation.id).state,'succeeded');
  assert.equal(f.creates(),1);assert.equal(f.inspects(),1);assert.equal(store.snapshot().records.filter(r=>r.kind==='resource').length,2);
  f.restart();worker=f.worker();await worker.tick();await worker.drain();assert.equal(f.creates(),1);assert.equal(f.inspects(),1);
});
test('installed composition loads exact action and connector pins and invokes a real helper subprocess',async t=>{
  const f=await fixture(t),configuration=configurationFixture(f.root);configuration.config.installationId=f.policy.installationId;
  const connectorPath=join(f.root,'runtime-connector.artifact.json');execFileSync(process.execPath,['scripts/package_extension.mjs','packages/connector-ssh',connectorPath]);
  const artifact=JSON.parse(readFileSync(connectorPath,'utf8'));
  // Substitute only the transport in this test: the real installed helper and
  // public driver run in independent processes. This is not SSH qualification.
  artifact.schemas.configuration={type:'object',additionalProperties:false,properties:{revision:{const:1}},required:['revision']};
  artifact.module=`import {spawn} from 'node:child_process';export function createExtension(){return{async validate(){},async invoke(request){return new Promise((resolve,reject)=>{const c=spawn(${JSON.stringify(process.execPath)},[${JSON.stringify(new URL('../apps/target-helper/main.ts',import.meta.url).pathname)},${JSON.stringify(f.runtimePolicyFile)}],{stdio:['pipe','pipe','pipe']});let out='';c.stdout.on('data',x=>out+=x);c.on('error',reject);c.on('close',code=>code?reject(Error('outcome_unknown')):resolve(JSON.parse(out)));c.stdin.end(JSON.stringify(request));});}};}`;
  writeFileSync(connectorPath,JSON.stringify(artifact));
  const connectorPin={id:'labstride.connector.ssh',version:artifact.manifest.version,kind:'connector',artifactPath:connectorPath,integrity:createHash('sha256').update(readFileSync(connectorPath)).digest('hex'),configuration:{revision:1},permissions:['network.ssh'],capabilities:['runtime.probe.v1','runtime.create.v1','runtime.inspect.v1']};
  configuration.dependencies.lock.extensions=[configuration.dependencies.lock.extensions.find(p=>p.kind==='provider'),connectorPin,f.runtimePin];
  configuration.config.targets={[f.policy.targetId]:{connector:connectorPin.id,configuration:{revision:1}}};
  const op=f.operationFor();configuration.config.workflows={prepare:[{id:'runtime',action:f.runtimePin.id,inputs:op.inputs}]};
  const result=await configuration.compile();assert.equal(result.ok,true,JSON.stringify(result));const snapshot=result.configuration.snapshot;
  op.configDigest=snapshot.digest;op.requestDigest=requestDigest(op);
  const action=configuredRuntimeAction({runConfiguration:()=>snapshot,get:(kind,id)=>f.store().get(kind,id)},f.host);
  await action.validate(op);const reply=await action.start(op,{});assert.equal(reply.result.status,'succeeded');assert.equal(reply.result.resources[0].type,'database');
  assert.deepEqual(await action.reconcile(op,op.operationId),reply);
  const forged=structuredClone(op);forged.inputs.workspaceOperationId='absent';forged.requestDigest=requestDigest(forged);await assert.rejects(action.validate(forged));
  writeFileSync(f.runtimePin.artifactPath,'changed artifact');await assert.rejects(action.start(op,{}));
});
for(const stage of ['after-boundary','after-reply'])test(`actual coordinator SIGKILL ${stage} does not repeat the runtime effect`,async t=>{
  const f=await fixture(t),{fork}=await import('node:child_process'),{once}=await import('node:events');
  const spec=join(f.root,'worker-kill.json');writeFileSync(spec,JSON.stringify({state:join(f.root,'coordinator'),installation:f.installation,operation:f.operationFor(),pin:f.runtimePin,host:f.host,stage}));
  const child=fork(new URL('./helpers/runtime-worker-process.mjs',import.meta.url),[spec],{stdio:['ignore','pipe','pipe','ipc']}),exited=once(child,'exit');
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}});
  const message=(await once(child,'message',{signal:AbortSignal.timeout(10000)}))[0];assert.equal(message.stage,stage);child.kill('SIGKILL');await exited;
  const store=f.restart(),worker=f.worker();await worker.tick();await worker.drain();
  assert.equal(store.get('operation',f.scheduled.operation.id).state,stage==='after-reply'?'succeeded':'outcome_unknown');
  assert.equal(f.creates(),0);assert.equal(f.inspects(),1);
  assert.equal(store.snapshot().records.filter(r=>r.kind==='resource').length,stage==='after-reply'?2:1);
});
