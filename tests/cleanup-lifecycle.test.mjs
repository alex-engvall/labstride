import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { cleanupFixture } from './helpers/cleanup-fixture.mjs';
import { localAuthority, context } from './helpers/configuration-fixture.mjs';
import { record } from './helpers/lifecycle-fixture.mjs';
import { createCleanupWorker } from '../packages/core/cleanup-worker.ts';
import { digest } from '../packages/configuration/json.ts';
const keep=(x,value)=>{const w=x.store.workspace(x.runId);x.store.setWorkspaceKeep(w.id,value,w.revision,localAuthority,context);};

test('AC30 source-only: selected action runs after confirmed completion and leaves a durable pending executor',async t=>{
 const x=await cleanupFixture(t);const result=await x.worker().assess(x.id);assert.equal(result.eligible,true,JSON.stringify(result));
 assert.equal(x.store.cleanupRequests(x.runId)[0].state,'pending_executor');assert.equal(x.store.workspace(x.runId).state,'ready');assert.ok(existsSync(x.path));
 assert.equal(x.store.get('run',x.runId).state,'completed');assert.throws(()=>x.store.claim(x.op.operationId,'test','again'));
 const saved=x.store.cleanupDecision(x.id);x.reopen();assert.deepEqual(x.store.cleanupDecision(x.id),saved);
 assert.equal(x.store.requestCleanup(x.runId,x.id,localAuthority,context),x.id);assert.equal(x.store.cleanupRequests(x.runId).length,1);
});
test('AC30 alternate pinned action and completion trigger change behavior without core edits',async t=>{
 const x=await cleanupFixture(t,{trigger:'completion_verified',alternative:true,optionalRuntime:true});await x.worker().tick();
 assert.equal(x.runtimeReceipt.resources[0].type,'database');assert.equal(x.runtimeReceipt.cleanup.trigger,'completion_verified');
 assert.equal(x.store.cleanupRequests(x.runId)[0].state,'retained');assert.equal(x.store.cleanupDecision(x.id).decision.eligible,true);assert.ok(existsSync(x.path));
 x.store.scheduleCompletionCleanup();assert.equal(x.store.cleanupRequests(x.runId).length,1);
 assert.throws(()=>x.store.requestCleanup(x.runId,'manual',localAuthority,context),e=>e.code==='effect_blocked');
});
test('AC17 local and remote keep independently block; local release never overrides remote retention',async t=>{
 const x=await cleanupFixture(t);keep(x,true);assert.ok((await x.worker().assess(x.id)).blockers.includes('local_keep'));assert.equal(x.inspectCalls,0);
 x.setKeep(true);keep(x,false);assert.ok((await x.worker().assess(x.id)).blockers.includes('remote_keep'));
 x.options.keepItem=async()=>null;assert.ok((await x.worker().assess(x.id)).blockers.includes('remote_keep_unknown'));assert.ok(existsSync(x.path));
 assert.equal(x.store.cleanupRequests(x.runId)[0].operation,null);
});
test('AC17 tracked sessions require independent idle read and preserve human ownership',async t=>{
 const x=await cleanupFixture(t),w=x.store.workspace(x.runId);
 const session=record('session','session-cleanup',{runId:x.runId,workspaceId:w.id,providerId:'test.session',sessionId:'actual-fixture-session',lastTurnId:'turn-1',humanActivityRevision:1,state:'ready',owner:'automation'});
 x.store.commit([{expectedRevision:null,record:session}],context);
 assert.ok((await x.worker().assess(x.id)).blockers.includes('session_observation_unknown'));
 x.options.session=async s=>({schemaVersion:'1.0',workspaceId:s.workspaceId,providerId:s.providerId,sessionId:s.sessionId,state:'busy',lastTurnId:s.lastTurnId,humanActivityRevision:s.humanActivityRevision,effectiveSettings:{},evidenceRefs:['test:session-read']});
 assert.ok((await x.worker().assess(x.id)).blockers.includes('session_observation_unknown'));
 const old=x.store.get('session',session.id);x.store.commit([{expectedRevision:old.revision,record:{...old,owner:'human',revision:old.revision+1}}],context);
 assert.ok((await x.worker().assess(x.id)).blockers.includes('session_active_or_held'));assert.ok(existsSync(x.path));
});
test('retention introduced during target inspection invalidates the assessment and handoff',async t=>{
 const x=await cleanupFixture(t),inspect=x.options.inspect;x.options.inspect=async(...args)=>{const reply=await inspect(...args);keep(x,true);return reply;};
 const result=await x.worker().assess(x.id);assert.equal(result.eligible,false);assert.ok(result.blockers.includes('state_changed'));assert.equal(x.store.cleanupRequests(x.runId)[0].operation,null);
});
test('fresh merge observation is required; projected status or agent turn completion cannot substitute',async t=>{
 const x=await cleanupFixture(t);x.providerTarget.state.merged=false;x.providerTarget.save();
 const result=await x.worker().assess(x.id);assert.ok(result.blockers.includes('merge_observation_unknown'));assert.equal(result.eligible,false);assert.ok(existsSync(x.path));
});
test('stale inspection, wrong ownership, and nonzero content counts cannot yield eligibility',async t=>{
 for(const modify of [i=>({...i,observedAt:'2000-01-01T00:00:00Z'}),i=>({...i,receiptDigest:'a'.repeat(64)}),i=>({...i,blockers:[],counts:{...i.counts,untracked:1}})]){
  const x=await cleanupFixture(t),inspect=x.options.inspect;x.options.inspect=async(...args)=>{const reply=await inspect(...args);return {...reply,inspection:modify(reply.inspection)};};
  assert.equal((await x.worker().assess(x.id)).eligible,false);assert.equal(x.store.cleanupRequests(x.runId)[0].operation,null);
 }
});
test('decision cannot be consumed after a hold or restore epoch change',async t=>{
 const x=await cleanupFixture(t);const pin=x.cleanupPin;
 // Prevent action import after assessment; this leaves a real eligible decision.
 const original=readFileSync(pin.artifactPath);writeFileSync(pin.artifactPath,'invalid');
 await assert.rejects(x.worker().assess(x.id));writeFileSync(pin.artifactPath,original);
 const decision=x.store.cleanupDecision(x.id);assert.equal(decision.decision.eligible,true);
 keep(x,true);assert.throws(()=>x.store.beginCleanupAssessment(x.id,decision.id),e=>e.code==='effect_blocked');keep(x,false);
 x.store.db.prepare('UPDATE recovery_control SET epoch=epoch+1').run();
 assert.throws(()=>x.store.beginCleanupAssessment(x.id,decision.id),e=>e.code==='effect_blocked');
});
test('lost action response reconciles the original operation without repeating start',async t=>{
 const x=await cleanupFixture(t,{configure(f,pin){const artifact=JSON.parse(readFileSync(pin.artifactPath)),marker=join(f.root,'assessment-starts');
 artifact.module="import {appendFileSync} from 'node:fs';\n"+artifact.module.replace("async start(operation){if(operation.inputs.schemaVersion==='2.0')return deletion(operation,'prepare');return result(operation);}",`async start(operation){appendFileSync(${JSON.stringify(marker)},'start\\n');throw Error('lost response');}`);
 writeFileSync(pin.artifactPath,JSON.stringify(artifact));pin.integrity=createHash('sha256').update(readFileSync(pin.artifactPath)).digest('hex');}});
 await x.worker().assess(x.id);const operation=x.store.cleanupRequests(x.runId)[0].operation;assert.equal(x.store.cleanupRequests(x.runId)[0].state,'outcome_unknown');
 x.reopen();await x.worker().assess(x.id);assert.equal(x.store.cleanupRequests(x.runId)[0].state,'pending_executor');assert.deepEqual(x.store.cleanupRequests(x.runId)[0].operation,operation);
 assert.equal(readFileSync(join(x.root,'assessment-starts'),'utf8'),'start\n');assert.ok(existsSync(x.path));
});
test('local keep controls and cleanup requests require the enrolled operator capability',async t=>{
 const x=await cleanupFixture(t),w=x.store.workspace(x.runId);assert.throws(()=>x.store.setWorkspaceKeep(w.id,false,w.revision,{},context),e=>e.code==='effect_blocked');
 assert.throws(()=>x.store.requestCleanup(x.runId,'untrusted',{},context),e=>e.code==='effect_blocked');
});

for(const stage of ['before-assessment','after-assessment'])test(`actual coordinator SIGKILL ${stage} retains one assessment identity`,async t=>{
 const {fork}=await import('node:child_process'),{once}=await import('node:events');
 const x=await cleanupFixture(t,{configure(f,pin){const artifact=JSON.parse(readFileSync(pin.artifactPath)),marker=join(f.root,'assessment-starts');
  artifact.module="import {appendFileSync} from 'node:fs';\n"+artifact.module.replace("async start(operation){if(operation.inputs.schemaVersion==='2.0')return deletion(operation,'prepare');return result(operation);}",`async start(operation){appendFileSync(${JSON.stringify(marker)},'start\\n');return result(operation);}`);
  writeFileSync(pin.artifactPath,JSON.stringify(artifact));pin.integrity=createHash('sha256').update(readFileSync(pin.artifactPath)).digest('hex');}});
 const bytes=readFileSync(x.cleanupPin.artifactPath);writeFileSync(x.cleanupPin.artifactPath,'unavailable');await assert.rejects(x.worker().assess(x.id));writeFileSync(x.cleanupPin.artifactPath,bytes);
 const decision=x.store.cleanupDecision(x.id);assert.equal(decision.decision.eligible,true);
 const child=fork(new URL('./helpers/cleanup-process.mjs',import.meta.url),[x.state,x.id,decision.id,stage,JSON.stringify(x.f.dependencies.host)],{stdio:['ignore','pipe','pipe','ipc']});
 let errors='';child.stderr.on('data',chunk=>errors+=chunk);const exit=once(child,'exit');
 const delivered=await Promise.race([once(child,'message',{signal:AbortSignal.timeout(10000)}),exit.then(()=>{throw Error(errors);})]);
 child.kill('SIGKILL');await exit;
 x.reopen();const operation=x.store.cleanupRequests(x.runId)[0].operation;assert.equal(operation.operationId,delivered[0].operationId);assert.equal(x.store.cleanupRequests(x.runId)[0].state,'outcome_unknown');
 await x.worker().assess(x.id);assert.equal(x.store.cleanupRequests(x.runId)[0].state,'pending_executor');
 const marker=join(x.root,'assessment-starts');assert.equal(existsSync(marker)?readFileSync(marker,'utf8'):'',stage==='after-assessment'?'start\n':'');assert.ok(existsSync(x.path));
});
