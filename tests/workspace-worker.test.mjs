import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { startCoordinator } from '../apps/coordinator/main.ts';
import { createWorker,actionKey } from '../packages/core/worker.ts';
import { loadExtension,freezeProfile } from '../packages/extensions/loader.ts';
import { WorkspaceRegistry } from '../packages/target-helper/workspaces.ts';
import { prepareWorkspaceStart } from '../packages/connector-ssh/workspaces.ts';
import { workspaceFixture } from './helpers/workspace-fixture.mjs';
import { startPlan,seed,eventInput,context } from './helpers/execution-fixture.mjs';
import { validated } from '../packages/storage-sqlite/validation.ts';
async function fixture(t,{lost=false}={}) {
  const f=workspaceFixture(t);f.policy.installationId=startPlan().request.installationId;f.request.installationId=f.policy.installationId;const registry=new WorkspaceRegistry(f.policy,f.dependencies);t.after(()=>registry.close());
  let invokes=0,inspections=0;
  const artifactPath=join(f.root,'action.artifact.json');execFileSync(process.execPath,['scripts/package_extension.mjs','packages/action-workspace-create',artifactPath]);
  const host={protocol:{major:1,minor:0},permissions:['filesystem.workspace'],capabilities:[]};
  const pin={id:'labstride.workspace-create',version:'1.0.0',kind:'action',artifactPath,integrity:createHash('sha256').update(readFileSync(artifactPath)).digest('hex'),
    permissions:['filesystem.workspace'],capabilities:['workspace.create.v1'],configuration:{}};
  const profile=freezeProfile(f.operation.runId,f.operation.configDigest,pin,host);
  const target={async binding(){return{installationId:f.policy.installationId,revision:1};},async validate(request){validated('ssh-workspace-request',request);},async invoke(request){
    if(request.method==='create')invokes++;else inspections++;
    const reply=await registry.handle(request);if(lost&&request.method==='create')throw Error('lost response');return reply;
  }};
  const loaded=await loadExtension(profile,host,{target}),raw=loaded.instance;
  const action={...raw,async start(op,claim){const result=await raw.start(op,claim);loaded.checkOutput(result);return result;},
    async reconcile(op,handle){const result=await raw.reconcile(op,handle);loaded.checkOutput(result);return result;}};
  const state=join(f.root,'coordinator');let runtime=startCoordinator(state);seed(runtime.store);
  let plan=startPlan();plan.operation.request=f.operation;plan.workspace.targetId=f.policy.targetId;plan.run.repositoryId=f.operation.source.repositoryId;
  plan=prepareWorkspaceStart(plan,f.policy.installationId);plan.projections=[];
  const input=eventInput();runtime.store.scheduleStart(runtime.store.receive(input).id,plan,context);
  const worker=store=>createWorker(store,{executorId:'workspace-test',nextAttempt:()=> 'attempt',adapters:new Map([[actionKey(f.operation.actionId,f.operation.actionVersion),action]])});
  t.after(()=>runtime.store.close());
  return {...f,plan,worker,action,loaded,store:()=>runtime.store,invokes:()=>invokes,inspections:()=>inspections,
    restart(){runtime.store.close();runtime=startCoordinator(state);return runtime.store;}};
}
test('installed public action produces a real Git checkout and atomically records readiness/resource',async t=>{
  const f=await fixture(t),worker=f.worker(f.store());await worker.tick();await worker.drain();
  assert.equal(f.store().get('operation',f.operation.operationId).state,'succeeded');
  assert.equal(f.store().get('workspace',f.operation.workspaceId).state,'ready');assert.equal(f.store().get('run',f.operation.runId).state,'ready');
  const resources=f.store().snapshot().records.filter(row=>row.kind==='resource');assert.equal(resources.length,1);assert.equal(resources[0].resourceType,'source-checkout');
  assert.equal(f.fetches(),1);assert.equal(f.invokes(),1);
});
test('lost reply, duplicate authorized start and restart adopt one actual checkout without invoking create again',async t=>{
  const f=await fixture(t,{lost:true});let worker=f.worker(f.store());await worker.tick();await worker.drain();assert.equal(f.store().get('operation',f.operation.operationId).state,'outcome_unknown');
  assert.equal(f.store().get('workspace',f.operation.workspaceId).state,'creating');
  const store=f.restart();const duplicate=eventInput();duplicate.event.eventId+=':duplicate';duplicate.event.externalId+=':duplicate';duplicate.checkpoint=null;
  assert.equal(store.scheduleStart(store.receive(duplicate).id,f.plan,context),f.operation.runId);
  worker=f.worker(store);await worker.tick();await worker.drain();assert.equal(store.get('operation',f.operation.operationId).state,'succeeded');
  assert.equal(store.get('workspace',f.operation.workspaceId).state,'ready');assert.equal(f.invokes(),1);assert.equal(f.inspections(),1);assert.equal(f.fetches(),1);
  assert.equal(store.snapshot().records.filter(row=>row.kind==='workspace').length,1);
});
test('forged workspace identity rejects the entire terminal result transaction',async t=>{
  const f=await fixture(t),store=f.store();const adapter={...f.action,async start(op,claim){const result=await f.action.start(op,claim);result.result.outputs.workspace.branch='labstride/ws-'+ 'a'.repeat(40);return result;}};
  const worker=createWorker(store,{executorId:'forged',nextAttempt:()=> 'attempt',adapters:new Map([[actionKey(f.operation.actionId,f.operation.actionVersion),adapter]])});
  await worker.tick();await worker.drain();assert.equal(store.get('operation',f.operation.operationId).state,'outcome_unknown');
  assert.equal(store.get('workspace',f.operation.workspaceId).state,'creating');assert.equal(store.snapshot().records.filter(row=>row.kind==='resource').length,0);
});
