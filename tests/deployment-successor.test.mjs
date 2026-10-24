import { freezeProfile, loadExtension } from '../packages/extensions/loader.ts';
import { createWorker, actionKey } from '../packages/core/worker.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { successorFixture } from './helpers/deployment-successor-fixture.mjs';
import { deploymentId } from '../packages/core/deployments.ts';
import { context } from './helpers/configuration-fixture.mjs';

test('confirmed merge containment and fresh independent successor evidence fulfill the earlier step without rewriting deployment',async t=>{
  const x=await successorFixture(t),op=x.earlier;
  assert.equal(x.store.successorFulfilled(op.operationId),false);
  x.store.advanceWorkflows(x.f.dependencies.host);assert.equal(x.store.operations(op.runId).length,2);
  await x.reconcile(op);
  const proof=x.store.successorEvidence(op.operationId).evidence;
  assert.equal(proof.mergeSha,x.b);assert.notEqual(proof.mergeSha,x.op.source.sha);assert.equal(proof.comparison.baseSha,x.b);assert.equal(proof.comparison.headSha,x.c);
  assert.equal(proof.successorOperationId,x.successor.operationId);assert.equal(x.store.successorFulfilled(op.operationId),true);
  assert.equal(x.store.get('deployment',deploymentId(op.operationId)).state,'superseded');
  assert.equal(x.store.get('operation',op.operationId).state,'superseded');assert.equal(x.store.workflowDispatch(op.operationId),null);
  x.store.advanceWorkflows(x.f.dependencies.host);assert.equal(x.store.operations(op.runId).length,3);
  await x.restart();assert.equal(x.store.successorFulfilled(op.operationId),true);assert.deepEqual(x.effects(),[x.successor.operationId]);
});

test('supersession without proof cannot complete a run, and expired proof cannot advance a step',async t=>{
  const x=await successorFixture(t),op=x.earlier;
  for(const state of ['preparing','ready','active']){const run=x.store.get('run',op.runId);x.store.commit([{expectedRevision:run.revision,record:{...run,state,revision:run.revision+1}}],context);}
  const run=x.store.get('run',op.runId);
  assert.throws(()=>x.store.commit([{expectedRevision:run.revision,record:{...run,state:'completed',revision:run.revision+1}}],context),e=>e.code==='recovery_required');
  await x.reconcile(op);assert.equal(x.store.successorFulfilled(op.operationId),true);
  x.advance();assert.equal(x.store.successorFulfilled(op.operationId),false);
  x.store.advanceWorkflows(x.f.dependencies.host);assert.equal(x.store.operations(op.runId).length,2);
  await x.configureTarget({observedAt:x.now()});await x.reconcile(op);assert.equal(x.store.successorFulfilled(op.operationId),true);
});

for(const [name,patch] of [['wrong repository',{sourceRepositoryId:'foreign'}],['wrong revision',{sourceSha:'f'.repeat(40)}],['wrong resource',{resourceId:'other'}],['unhealthy',{health:'unhealthy'}],['stale',{observedAt:'2020-01-01T00:00:00Z'}]])
 test(`successor ${name} does not fulfill the superseded run`,async t=>{
  const x=await successorFixture(t);await x.configureTarget(patch);await x.reconcile(x.earlier);
  assert.equal(x.store.successorFulfilled(x.earlier.operationId),false);assert.equal(x.store.successorEvidence(x.earlier.operationId),null);
  assert.equal(x.effects().length,1);
 });

test('PR head substitution, divergent or foreign comparison and merge record conflicts cannot supply containment',async t=>{
  const x=await successorFixture(t),op=x.earlier,compare=x.provider.compare;
  for(const patch of [{baseSha:x.op.source.sha},{repositoryId:'other'},{relation:'diverged'}]){
    x.provider.compare=async(...args)=>({...await compare(...args),...patch});await x.reconcile(op);assert.equal(x.store.successorEvidence(op.operationId),null);
  }
  x.provider.compare=compare;
  const merge=x.store.confirmedDeploymentMerge(op.operationId);
  x.store.db.prepare('UPDATE merge_intents SET payload=json_set(payload,\'$.outcome\',\'conflict\') WHERE operation_id=?').run(merge.operationId);
  await x.reconcile(op);assert.equal(x.store.successorEvidence(op.operationId),null);
});

test('target changes, recovery epochs and late workflow conflicts reject successor evidence after asynchronous reads',async t=>{
  const x=await successorFixture(t),op=x.earlier,compare=x.provider.compare;
  x.provider.compare=async(...args)=>{const result=await compare(...args);x.store.db.prepare('UPDATE deployment_targets SET revision=revision+1').run();return result;};
  await x.reconcile(op);assert.equal(x.store.successorEvidence(op.operationId),null);
  x.provider.compare=async(...args)=>{const result=await compare(...args);x.store.db.prepare('UPDATE recovery_control SET epoch=epoch+1').run();return result;};
  await x.reconcile(op);assert.equal(x.store.successorEvidence(op.operationId),null);
  x.provider.compare=compare;await x.reconcile(op);assert.equal(x.store.successorFulfilled(op.operationId),true);
  x.store.workflowConflict(x.successor.operationId);assert.equal(x.store.successorFulfilled(op.operationId),false);
  x.store.advanceWorkflows(x.f.dependencies.host);assert.equal(x.store.operations(op.runId).length,2);
});

test('consumed successor proof keeps completed work terminal after observation expiry and later target changes',async t=>{
  const x=await successorFixture(t),op=x.earlier;
  await x.reconcile(op);x.store.advanceWorkflows(x.f.dependencies.host);
  const next=x.store.operations(op.runId).at(-1),pin=x.compiled.snapshot.extensionLock.extensions.find(p=>p.id==='test.action');
  const loaded=await loadExtension(freezeProfile(op.runId,x.compiled.snapshot.digest,pin,x.f.dependencies.host),x.f.dependencies.host);
  const worker=createWorker(x.store,{executorId:'followup',nextAttempt:()=> 'followup-attempt',adapters:new Map([[actionKey(pin.id,pin.version),loaded.instance]])});
  await worker.tick();await worker.drain();assert.equal(x.store.get('operation',next.id).state,'succeeded');
  for(const state of ['preparing','ready','active','completed']){const run=x.store.get('run',op.runId);x.store.commit([{expectedRevision:run.revision,record:{...run,state,revision:run.revision+1}}],context);}
  x.advance();x.store.db.prepare('UPDATE deployment_targets SET revision=revision+1').run();
  assert.equal(x.store.successorFulfilled(op.operationId),false);assert.equal(x.store.successorSatisfied(op.operationId),true);
  assert.equal(x.store.delivery(`operation:${op.operationId}`).state,'done');
  assert.equal(x.store.get('run',op.runId).state,'completed');assert.equal(x.store.schedulingStatus(op.runId).reserved,false);
  await x.restart();assert.equal(x.store.schedulingStatus(op.runId).reserved,false);assert.equal(x.store.successorSatisfied(op.operationId),true);
  assert.equal(x.store.get('deployment',deploymentId(op.operationId)).state,'superseded');assert.equal(x.effects().length,1);
});
