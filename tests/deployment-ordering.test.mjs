import { fork } from 'node:child_process';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { orderingFixture } from './helpers/deployment-ordering-fixture.mjs';
import { deploymentId } from '../packages/core/deployments.ts';
import { claimOperation, executeClaim } from '../tools/workflow-runner/client.mjs';
import { context, localAuthority } from './helpers/configuration-fixture.mjs';
import { removeDeploymentOrderingMigration } from './helpers/migration-fixture.mjs';

async function newer(x, sha=x.b) {
  const b=x.admit('-b',{...x.op.source,sha}); await x.start(b); await x.deliver(b); await x.reconcile(b); return b;
}
test('AC15 local: queue A then B, verify B first, supersede A without dispatch or target effect across restart',async t=>{
  const x=await orderingFixture(t), a=x.op, before=x.store.deploymentOrder(a.operationId);
  assert.equal(before.expectedPredecessor,null);
  const b=await newer(x);
  assert(x.store.deploymentOrder(b.operationId).sequence>before.sequence);
  const result=await x.start(a); assert.equal(result.result.status,'superseded');
  assert.deepEqual(x.dispatches,[b.operationId]);assert.deepEqual(x.effects(),[b.operationId]);assert.equal(x.target().sourceSha,x.b);
  assert.equal(x.store.get('deployment',deploymentId(a.operationId)).state,'superseded');
  assert.equal(x.store.workflowDispatch(a.operationId),null);assert.equal(x.store.workflowClaim(a.operationId),null);
  assert.equal(x.store.workflowExecutions(a.runId)[0].cleanupBlocked,true);
  x.store.advanceWorkflows(x.f.dependencies.host);assert.equal(x.store.operations(a.runId).length,1);
  await x.restart();await x.reconcile(a);
  assert.equal(x.store.get('operation',a.operationId).state,'superseded');assert.equal(x.store.successorFulfilled(a.operationId),false);
  assert.deepEqual(x.effects(),[b.operationId]);assert.equal(x.target().sourceSha,x.b);
  assert.equal(x.store.db.prepare('SELECT count(*) AS n FROM claims WHERE operation_id=? AND active=1').get(a.operationId).n,0);
});

test('newer queued descendants proceed, but late ancestors, identical revisions and divergent histories cannot overwrite',async t=>{
  for(const [label,shaName,expected] of [['descendant','c','outcome_unknown'],['ancestor','a','superseded'],['identical','b','superseded'],['divergent','divergent','accepted']]) await t.test(label,async t=>{
    const x=await orderingFixture(t);await newer(x);
    // Release the admitted test run's capacity by raising the test-only policy.
    x.store.configureScheduling({schemaVersion:'1.0',activeRuns:8,development:8,ciReview:8},context);
    const op=x.admit('-late',{...x.op.source,sha:x[shaName]});
    assert.notEqual(x.store.deploymentOrder(op.operationId).expectedPredecessor,null);
    const result=await x.start(op);assert.equal(result.result.status,expected);
    if(label==='descendant'){await x.deliver(op);await x.reconcile(op);assert.equal(x.target().sourceSha,x.c);}
    else {assert.equal(x.store.workflowDispatch(op.operationId),null);assert.equal(x.target().sourceSha,x.b);assert.equal(x.effects().length,1);}
    if(label==='divergent')assert.equal(result.result.outputs.blocker,'revision_diverged');
  });
});

test('unavailable or mismatched ancestry blocks dispatch and read-only reconciliation can recover',async t=>{
  const x=await orderingFixture(t);await newer(x);const compare=x.provider.compare;
  x.provider.compare=async()=>{throw Error('offline');};
  assert.equal((await x.start(x.op)).result.outputs.blocker,'comparison_unavailable');
  assert.equal(x.store.workflowDispatch(x.op.operationId),null);
  x.provider.compare=async(...args)=>({...await compare(...args),repositoryId:'wrong'});
  assert.equal((await x.reconcile(x.op)).result.outputs.blocker,'comparison_unavailable');
  x.provider.compare=compare;assert.equal((await x.reconcile(x.op)).result.status,'superseded');
  assert.equal(x.effects().length,1);
});

test('stale predecessor snapshots and recovery epochs are rejected before dispatch and runner effect permission',async t=>{
  const x=await orderingFixture(t), stale=x.store.deploymentOrderContext(x.op.operationId);await newer(x);
  assert.throws(()=>x.store.recordOrderCheck(stale,null),e=>e.code==='effect_blocked');
  x.store.configureScheduling({schemaVersion:'1.0',activeRuns:8,development:8,ciReview:8},context);
  const c=x.admit('-c',{...x.op.source,sha:x.c});await x.start(c);
  const opts=x.runner(c),bound=await claimOperation(opts);
  x.store.db.prepare('UPDATE recovery_control SET epoch=epoch+1').run();
  let effects=0;
  await assert.rejects(executeClaim(opts,bound,{observeSource:()=>c.source.sha,effect:async()=>{effects++;return {conclusion:'succeeded',resources:[],outputs:{}};}}));
  assert.equal(effects,0);assert.equal(x.store.db.prepare('SELECT consumed FROM workflow_claims WHERE operation_id=?').get(c.operationId).consumed,0);
  assert.equal(x.store.db.prepare('SELECT active FROM workflow_dispatches WHERE operation_id=?').get(c.operationId).active,1);
});

test('one target remains locked across separate jobs, retries and restart; a different environment is independent',async t=>{
  const x=await orderingFixture(t),b=x.admit('-b',{...x.op.source,sha:x.b});await x.start(x.op);
  await assert.rejects(x.start(b),e=>e.code==='resource_busy');
  const opts=x.runner(x.op),bound=await claimOperation(opts);
  await x.restart();
  assert.equal((await claimOperation(x.runner(x.op))).claim.claimId,bound.claim.claimId);
  x.runs.get(x.op.operationId).runAttempt=2;
  const attempt2=await x.sign({run_attempt:'2'});
  assert.equal((await x.post('claim',undefined,attempt2)).status,409);
  x.runs.get(x.op.operationId).runAttempt=1;
  await assert.rejects(x.start(b),e=>e.code==='resource_busy');
  x.store.configureScheduling({schemaVersion:'1.0',activeRuns:8,development:8,ciReview:8},context);
  const other=x.admit('-other',{...x.op.source,sha:x.b},'other');await x.start(other);
  assert.deepEqual(x.dispatches,[x.op.operationId,other.operationId]);
  await x.deliver(x.op);await x.reconcile(x.op);
  assert.equal(x.store.get('deployment',deploymentId(x.op.operationId)).state,'verified');
});

test('a lost runner authorization response retains the lock and never replays its possible effect',async t=>{
  const x=await orderingFixture(t),b=x.admit('-b',{...x.op.source,sha:x.b});await x.start(x.op);
  const opts=x.runner(x.op),bound=await claimOperation(opts),transport=opts.fetcher;
  const lost={...opts,fetcher:async(url,init)=>{const r=await transport(url,init);if(String(url).endsWith('/authorize-effect'))throw Error('lost reply');return r;}};
  let effects=0;const callbacks={observeSource:()=>x.a,effect:async()=>{effects++;return {conclusion:'succeeded',resources:[],outputs:{}};}};
  await assert.rejects(executeClaim(lost,bound,callbacks));await x.restart();
  await assert.rejects(executeClaim(x.runner(x.op),bound,callbacks));await assert.rejects(x.start(b),e=>e.code==='resource_busy');
  assert.equal(effects,0);assert.equal(x.store.db.prepare('SELECT consumed FROM workflow_claims WHERE operation_id=?').get(x.op.operationId).consumed,1);
  assert.equal(x.dispatches.length,1);
});

test('migration 17 preserves active dispatches and receipts, invents no order, and blocks legacy targets',async t=>{
  const x=await orderingFixture(t);await x.start(x.op);await x.deliver(x.op);
  const before=x.store.workflowReceipt(x.op.operationId),dispatch=x.store.workflowDispatch(x.op.operationId);
  const db=new DatabaseSync(join(x.state,'state.sqlite'));removeDeploymentOrderingMigration(db);db.close();
  await x.restart();
  assert.deepEqual(x.store.workflowReceipt(x.op.operationId),before);assert.deepEqual(x.store.workflowDispatch(x.op.operationId),dispatch);
  assert.equal(x.store.deploymentOrder(x.op.operationId),null);
  await x.reconcile(x.op); // Existing effects remain observable without invented queue metadata.
  const b=x.admit('-b',{...x.op.source,sha:x.b});
  assert.equal((await x.start(b)).result.outputs.blocker,'legacy_order_unknown');
  assert.equal(x.store.workflowDispatch(b.operationId),null);assert.equal(x.effects().length,1);
});

test('concurrent target contenders obtain one dispatch, and forged supersession cannot release a dispatched operation',async t=>{
  const x=await orderingFixture(t),b=x.admit('-b',{...x.op.source,sha:x.b});
  const results=await Promise.allSettled([x.start(x.op),x.start(b)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(x.dispatches.length,1);
  const op=x.dispatches[0]===x.op.operationId?x.op:b;
  const forged={schemaVersion:'1.0',kind:'result',operationId:op.operationId,requestDigest:op.requestDigest,
    result:{status:'superseded',handle:op.operationId,resources:[],outputs:{deploymentVerified:false,orderEvidenceId:'f'.repeat(64)},evidenceRefs:['forged:success'],error:null}};
  const state=x.store.get('operation',op.operationId);
  assert.throws(()=>x.store.acceptResult(forged,null,state.revision,[],x.store.recoveryEpoch()));
  assert.equal(x.store.db.prepare('SELECT active FROM workflow_dispatches WHERE operation_id=?').get(op.operationId).active,1);
});

test('supersession finalization rejects a stale epoch without releasing its claim or changing deployment history',async t=>{
  const x=await orderingFixture(t);await newer(x);const op=x.op;
  const claim=x.store.claim(op.operationId,'ordering-test','attempt');x.store.beginEffect(claim);
  const result=await x.adapter().start(op,claim);assert.equal(result.result.status,'superseded');
  x.store.db.prepare('UPDATE recovery_control SET epoch=epoch+1').run();
  assert.throws(()=>x.store.acceptResult(result,claim,1));
  assert.equal(x.store.get('deployment',deploymentId(op.operationId)).state,'requested');
  assert.equal(x.store.get('operation',op.operationId).state,'running');
  assert.equal(x.store.db.prepare('SELECT active FROM claims WHERE operation_id=?').get(op.operationId).active,1);
  assert.equal(x.effects().length,1);
});

for(const mode of ['during-supersession','after-finalization'])test(`SIGKILL ${mode} preserves supersession and the newer target`,async t=>{
  const x=await orderingFixture(t),b=await newer(x),op=x.op;
  const claim=x.store.claim(op.operationId,'ordering-test','attempt');x.store.beginEffect(claim);
  const comparison=await x.provider.compare(x.enrollment,op.source,x.b,x.a);
  const data=join(x.root,'supersession-process.json');
  writeFileSync(data,JSON.stringify({now:x.now(),operationId:op.operationId,comparison,host:x.f.dependencies.host}));
  await x.stopListener();
  const child=fork(new URL('./helpers/deployment-process.mjs',import.meta.url),[x.state,mode,data],{stdio:['ignore','ignore','pipe','ipc']});
  const done=once(child,'exit');t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await done;}});
  assert.equal((await once(child,'message',{signal:AbortSignal.timeout(10000)}))[0].stage,mode);
  assert.equal(x.store.get('deployment',deploymentId(op.operationId)).state,mode==='during-supersession'?'requested':'superseded');
  assert.equal(x.store.deploymentOrderContext(op.operationId).current.operationId,b.operationId);
  child.kill('SIGKILL');await done;await x.restart();await x.reconcile(op);
  assert.equal(x.store.get('operation',op.operationId).state,'superseded');assert.equal(x.store.workflowDispatch(op.operationId),null);
  assert.deepEqual(x.effects(),[b.operationId]);assert.deepEqual(x.dispatches,[b.operationId]);assert.equal(x.target().sourceSha,x.b);
});

test('cancelling an unfulfilled superseded run requires no new effect or containment proof',async t=>{
  const x=await orderingFixture(t);await newer(x);await x.start(x.op);
  const run=x.store.get('run',x.op.runId);
  x.store.cancelRun({schemaVersion:'1.0',id:'cancel-superseded',runId:run.id,expectedRevision:run.revision,command:'cancel'},context,localAuthority);
  assert.equal(x.store.get('run',run.id).state,'cancelled');assert.equal(x.store.successorFulfilled(x.op.operationId),false);
  assert.equal(x.effects().length,1);assert.equal(x.store.schedulingStatus(run.id).reserved,false);
});

test('AC15 worker path: a paused A queues first, B verifies, then resumed A is superseded',async t=>{
  const x=await orderingFixture(t),a=x.op,b=x.admit('-b',{...x.op.source,sha:x.b});
  let run=x.store.get('run',a.runId);
  x.store.pauseRun({schemaVersion:'1.0',id:'pause-a',runId:run.id,expectedRevision:run.revision,command:'pause'},context,localAuthority);
  let worker=x.worker();await worker.tick();await worker.drain();
  assert.deepEqual(x.dispatches,[b.operationId]);await x.deliver(b);x.advance(15001);
  worker=x.worker();await worker.tick();await worker.drain();
  assert.equal(x.store.get('deployment',deploymentId(b.operationId)).state,'verified');
  run=x.store.get('run',a.runId);
  x.store.resumeRun({schemaVersion:'1.0',id:'resume-a',runId:run.id,expectedRevision:run.revision,command:'resume'},context,localAuthority);
  worker=x.worker();await worker.tick();await worker.drain();
  assert.equal(x.store.get('operation',a.operationId).state,'superseded');assert.deepEqual(x.effects(),[b.operationId]);
  assert.equal(x.target().sourceSha,x.b);assert.deepEqual(x.dispatches,[b.operationId]);
});

test('a workflow-only enrollment cannot bypass an already ordered target',async t=>{
  const x=await orderingFixture(t,{configure(f,enrollment){
    const workflowOnly=structuredClone(enrollment);delete workflowOnly.deployment;
    f.dependencies.lock.extensions.find(p=>p.id==='labstride.github-workflow').configuration.enrollments.workflowOnly=workflowOnly;
  }});
  await newer(x);x.store.configureScheduling({schemaVersion:'1.0',activeRuns:8,development:8,ciReview:8},context);
  const op=x.admit('-workflow-only',{...x.op.source,sha:x.a},'workflowOnly');
  await assert.rejects(x.start(op),e=>e.code==='effect_blocked');
  assert.equal(x.store.workflowDispatch(op.operationId),null);assert.equal(x.store.get('operation',op.operationId).effectBoundary,'not_crossed');
  assert.equal(x.effects().length,1);assert.equal(x.target().sourceSha,x.b);
});
