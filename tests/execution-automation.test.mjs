import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {startCoordinator} from '../apps/coordinator/main.ts';
import {createWorker,actionKey} from '../packages/core/worker.ts';
import {requestDigest} from '../packages/storage-sqlite/execution.ts';
import {seed,schedule,context} from './helpers/execution-fixture.mjs';
import {hook} from './helpers/observation-fixture.mjs';
import {fixtureRecords} from './helpers/lifecycle-fixture.mjs';
const fail=code=>e=>e.code===code;
const bound=(op,status='succeeded')=>({schemaVersion:'1.0',kind:'result',operationId:op.id,requestDigest:op.request.requestDigest,result:{status,handle:'turn-handle',resources:[],outputs:{},evidenceRefs:['test:observed'],error:status==='failed'?{code:'operation_failed',message:'Observed failure',evidenceId:null,retryClass:'none'}:null}});
function fixture(t){let now='2026-10-21T12:00:00.000Z';const root=mkdtempSync(join(tmpdir(),'labstride-automation-'));const {store}=startCoordinator(root,{clock:{now:()=>now}});seed(store);const plan=schedule(store);
 const claim=store.claim(plan.operation.id,'original','original');store.beginEffect(claim);store.acceptResult(bound(plan.operation),claim,1);
 const session={...fixtureRecords().find(r=>r.kind==='session'),owner:'automation'};store.commit([{record:session,expectedRevision:null}],context);
 t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});return{root,store,plan,session,setNow:value=>now=value};}
function follow(f,index,automation={schemaVersion:'1.0'}){const operation=structuredClone(f.plan.operation),outbox=structuredClone(f.plan.outbox);operation.id+=`:follow${index}`;operation.request.operationId=operation.id;operation.request.requestDigest=requestDigest(operation.request);
 outbox.id+=`:follow${index}`;outbox.operationId=operation.id;outbox.intentKey+=`:follow${index}`;outbox.payload.operationId=operation.id;
 const input={operation,outbox,resourceKey:f.plan.resourceKey,automation};f.store.scheduleOperation(input,context);return input;}
function guard(f){return{enrollmentId:f.session.id,sessionId:f.session.sessionId,expectedLastTurnId:f.session.lastTurnId,expectedHumanActivityRevision:f.session.humanActivityRevision};}
function worker(f,adapter){return createWorker(f.store,{executorId:'test',nextAttempt:()=>crypto.randomUUID(),adapters:new Map([[actionKey(f.plan.operation.request.actionId,f.plan.operation.request.actionVersion),adapter]])});}
function ctl(f,command){return{schemaVersion:'1.0',id:crypto.randomUUID(),runId:f.plan.run.id,expectedRevision:f.store.get('run',f.plan.run.id).revision,command};}
test('missing atomic backend guards block a queued send before submission',async t=>{
 const f=fixture(t),input=follow(f,1,{schemaVersion:'1.0',sessionGuard:guard(f)});let starts=0;
 const w=worker(f,{async validate(){},async start(){starts++;return bound(input.operation);},async reconcile(){throw Error();}});await w.tick();await w.drain();
 assert.equal(starts,0);assert.equal(f.store.get('operation',input.operation.id).effectBoundary,'not_crossed');assert.equal(f.store.delivery(`operation:${input.operation.id}`).lastError,'unsupported_capability');
});
test('stale turn is rejected locally even when atomic backend guards are advertised',async t=>{
 const f=fixture(t),input=follow(f,1,{schemaVersion:'1.0',sessionGuard:guard(f)});const session=f.store.get('session',f.session.id);
 f.store.commit([{record:{...session,lastTurnId:'new-turn',revision:session.revision+1},expectedRevision:session.revision}],context);let starts=0;
 const w=worker(f,{atomicSessionGuards:true,async validate(){},async start(){starts++;return bound(input.operation);},async reconcile(){throw Error();}});await w.tick();await w.drain();
 assert.equal(starts,0);assert.equal(f.store.delivery(`operation:${input.operation.id}`).lastError,'stale_revision');
});
for(const human of ['control','activity'])test(`human takeover persists across restart and ordinary resume (${human})`,async t=>{
 const f=fixture(t),input=follow(f,1,{schemaVersion:'1.0',sessionGuard:guard(f)});
 if(human==='control')f.store.takeoverRun(ctl(f,'takeover'),context);
 else {const session=f.store.get('session',f.session.id);f.store.commit([{record:{...session,humanActivityRevision:8,revision:session.revision+1},expectedRevision:session.revision}],context);}
 f.store.resumeRun(ctl(f,'resume'),context);
 const reboot=startCoordinator(f.root);t.after(()=>reboot.store.close());assert.equal(reboot.store.controlStatus(f.plan.run.id).humanHold,true);
 reboot.store.receiveHook(f.session.id,hook(f.session,'late-stop'));assert.equal(reboot.store.controlStatus(f.plan.run.id).humanHold,true);
 const session=reboot.store.get('session',f.session.id);reboot.store.commit([{record:{...session,state:'ready',owner:'automation',revision:session.revision+1},expectedRevision:session.revision}],context);
 assert.throws(()=>reboot.store.claim(input.operation.id,'stale','stale'),fail('effect_blocked'));
});
test('synthetic backend applies guards atomically; human race rejects without a second turn',async t=>{
 const f=fixture(t),input=follow(f,1,{schemaVersion:'1.0',sessionGuard:guard(f)});const db=new DatabaseSync(join(f.root,'session-backend.sqlite'));
 t.after(()=>db.close());db.exec('CREATE TABLE session (id INTEGER PRIMARY KEY,revision INTEGER,turn TEXT); CREATE TABLE sends (id TEXT)');db.prepare('INSERT INTO session VALUES (1,?,?)').run(7,f.session.lastTurnId);
 const adapter={atomicSessionGuards:true,async validate(){},async start(request,claim,expected){
  db.prepare('UPDATE session SET revision=revision+1 WHERE id=1').run(); // human wins after the local gate
  db.exec('BEGIN IMMEDIATE');const row=db.prepare('SELECT * FROM session WHERE id=1').get();
  if(row.revision!==expected.expectedHumanActivityRevision||row.turn!==expected.expectedLastTurnId){db.exec('ROLLBACK');throw Error('stale guard rejected');}
  db.prepare('INSERT INTO sends VALUES (?)').run(request.operationId);db.exec('COMMIT');return bound(input.operation);
 },async reconcile(){throw Error();}};
 const w=worker(f,adapter);await w.tick();await w.drain();assert.equal(db.prepare('SELECT count(*) AS n FROM sends').get().n,0);
 assert.equal(f.store.get('operation',input.operation.id).state,'outcome_unknown');
});
test('supported synthetic atomic guard starts exactly the enrolled turn',async t=>{
 const f=fixture(t),input=follow(f,1,{schemaVersion:'1.0',sessionGuard:guard(f)});let sends=0;
 const w=worker(f,{atomicSessionGuards:true,async validate(){},async start(request,claim,expected){assert.deepEqual(expected,guard(f));sends++;return bound(input.operation);},async reconcile(){throw Error();}});
 await w.tick();await w.drain();await w.tick();await w.drain();assert.equal(sends,1);assert.equal(f.store.get('operation',input.operation.id).state,'succeeded');
});
test('three repairs consume a persisted budget; fourth is blocked after restart and resume',t=>{
 const f=fixture(t);
 for(let i=1;i<=3;i++){const input=follow(f,i,{schemaVersion:'1.0',repair:{failureFingerprint:`failure-${i}`}});const claim=f.store.claim(input.operation.id,'repair',`repair-${i}`);f.store.beginEffect(claim);f.store.acceptResult(bound(input.operation,'failed'),claim,1);}
 const reboot=startCoordinator(f.root);t.after(()=>reboot.store.close());reboot.store.resumeRun(ctl({...f,store:reboot.store},'resume'),context);
 assert.throws(()=>follow({...f,store:reboot.store},4,{schemaVersion:'1.0',repair:{failureFingerprint:'fourth'}}),fail('effect_blocked'));
 assert.equal(reboot.store.controlStatus(f.plan.run.id).budget.repairs,3);assert.equal(reboot.store.controlStatus(f.plan.run.id).budgetHold,'repair_budget');
 const budget={schemaVersion:'1.0',id:'authorized-renewal',runId:f.plan.run.id,expectedRevision:reboot.store.get('run',f.plan.run.id).revision,maxRepairs:4,unattendedMs:86400000};
 reboot.store.updateRunBudget(budget,context);reboot.store.updateRunBudget(budget,context);assert.equal(reboot.store.controlStatus(f.plan.run.id).budget.repairs,3);
 const input=follow({...f,store:reboot.store},4,{schemaVersion:'1.0',repair:{failureFingerprint:'fourth'}});assert.equal(reboot.store.get('operation',input.operation.id).state,'prepared');
});
test('two identical repair failures pause earlier and cannot be cleared by resume',t=>{
 const f=fixture(t);for(let i=1;i<=2;i++){const input=follow(f,i,{schemaVersion:'1.0',repair:{failureFingerprint:'same-ci-failure'}});const claim=f.store.claim(input.operation.id,'repair',`repair-${i}`);f.store.beginEffect(claim);f.store.acceptResult(bound(input.operation,'failed'),claim,1);}
 f.store.resumeRun(ctl(f,'resume'),context);assert.equal(f.store.controlStatus(f.plan.run.id).budgetHold,'repeated_failure');assert.throws(()=>follow(f,3),fail('effect_blocked'));
});
test('24-hour unattended deadline survives resume; renewal needs an explicit budget policy',t=>{
 const f=fixture(t),input=follow(f,1);f.setNow('2026-10-22T12:00:00.000Z');f.store.resumeRun(ctl(f,'resume'),context);
 assert.throws(()=>f.store.claim(input.operation.id,'late','late'),fail('effect_blocked'));assert.equal(f.store.controlStatus(f.plan.run.id).budgetHold,'unattended_timeout');
 f.store.updateRunBudget({schemaVersion:'1.0',id:'renew-time',runId:f.plan.run.id,expectedRevision:f.store.get('run',f.plan.run.id).revision,maxRepairs:3,unattendedMs:86400000},context);
 const claim=f.store.claim(input.operation.id,'renewed','renewed');f.store.beginEffect(claim);assert.equal(f.store.get('operation',input.operation.id).state,'running');
});
test('unresolved original effects block follow-up scheduling',t=>{const f=fixture(t),input=follow(f,1);const claim=f.store.claim(input.operation.id,'one','one');f.store.beginEffect(claim);f.store.markUnknown(input.operation.id);assert.throws(()=>follow(f,2),fail('effect_blocked'));});
for(const boundary of ['after-boundary','after-effect'])test(`real repair process death at ${boundary} preserves budget and original effect identity`,async t=>{
 const f=fixture(t);f.store.updateRunBudget({schemaVersion:'1.0',id:'one-repair-policy',runId:f.plan.run.id,expectedRevision:f.store.get('run',f.plan.run.id).revision,maxRepairs:1,unattendedMs:86400000},context);
 const input=follow(f,1,{schemaVersion:'1.0',repair:{failureFingerprint:'ci-failure'}});
 const {fork}=await import('node:child_process');const {once}=await import('node:events');const message=async p=>(await once(p,'message',{signal:AbortSignal.timeout(10000)}))[0];
 const child=(file,args)=>{const p=fork(new URL(`./helpers/${file}`,import.meta.url),args,{stdio:['ignore','pipe','pipe','ipc']});p.exited=once(p,'exit');t.after(async()=>{if(p.exitCode===null&&p.signalCode===null){p.kill('SIGKILL');await p.exited;}});return p;};
 const targetPath=join(f.root,'target.sqlite'),target=child('effect-target.mjs',[targetPath]);const {url}=await message(target);
 const process=child('execution-process.mjs',[boundary,f.root,url,input.operation.id,'2026-10-21T12:00:00.000Z']);await message(process);const barrier=message(process);process.send('go');assert.equal((await barrier).stage,boundary);process.kill('SIGKILL');await process.exited;
 const reboot=startCoordinator(f.root,{clock:{now:()=> '2026-10-21T12:00:00.000Z'}});t.after(()=>reboot.store.close());assert.equal(reboot.store.controlStatus(f.plan.run.id).budget.repairs,1);
 const w=worker({...f,store:reboot.store},{async validate(){},async start(){assert.fail('must not replay');},async reconcile(request){return(await fetch(url+'/observe',{method:'POST',body:JSON.stringify(request)})).json();}});
 await w.tick();await w.drain();assert.equal(reboot.store.get('operation',input.operation.id).state,boundary==='after-effect'?'succeeded':'outcome_unknown');
 const db=new DatabaseSync(targetPath);assert.equal(db.prepare('SELECT count(*) AS n FROM calls').get().n,boundary==='after-effect'?1:0);db.close();
 reboot.store.resumeRun(ctl({...f,store:reboot.store},'resume'),context);assert.throws(()=>follow({...f,store:reboot.store},2,{schemaVersion:'1.0',repair:{failureFingerprint:'next'}}),fail('effect_blocked'));
});
test('an enrolled session-command adapter cannot submit when the scheduling guard was omitted',async t=>{
 const f=fixture(t),input=follow(f,1);let starts=0;
 const w=worker(f,{requiresSessionGuard:true,atomicSessionGuards:true,async validate(){},async start(){starts++;return bound(input.operation);},async reconcile(){throw Error();}});
 await w.tick();await w.drain();assert.equal(starts,0);assert.equal(f.store.get('operation',input.operation.id).effectBoundary,'not_crossed');
 assert.equal(f.store.delivery(`operation:${input.operation.id}`).lastError,'validation_failed');
});
