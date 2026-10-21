import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startCoordinator} from '../apps/coordinator/main.ts';
import {createWorker,actionKey} from '../packages/core/worker.ts';
import {createControlWorker} from '../packages/core/control-worker.ts';
import {SqliteStore} from '../packages/storage-sqlite/store.ts';
import {seed,schedule,context} from './helpers/execution-fixture.mjs';
const fail=code=>e=>e.code===code;
function fixture(t){const root=mkdtempSync(join(tmpdir(),'labstride-controls-'));const {store}=startCoordinator(root);seed(store);const plan=schedule(store);
 t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});return{root,store,plan};}
function control(store,plan,command,id=crypto.randomUUID()){return{schemaVersion:'1.0',id,runId:plan.run.id,expectedRevision:store.get('run',plan.run.id).revision,command};}
function bound(plan,status='accepted'){return{schemaVersion:'1.0',kind:'result',operationId:plan.operation.id,requestDigest:plan.operation.request.requestDigest,result:{status,handle:'original-handle',resources:[],outputs:{},evidenceRefs:['test:target'],error:null}};}
function running(store,plan){const claim=store.claim(plan.operation.id,'executor','attempt');store.beginEffect(claim);store.acceptResult(bound(plan),claim,1);return claim;}
function options(plan,adapter){return{executorId:'test',nextAttempt:()=>crypto.randomUUID(),adapters:new Map([[actionKey(plan.operation.request.actionId,plan.operation.request.actionVersion),adapter]])};}
test('pause/resume is idempotent, preserves checkpoint and cannot be bypassed through base store',t=>{
 const {store,root,plan}=fixture(t);const claim=store.claim(plan.operation.id,'executor','attempt');
 const pause=control(store,plan,'pause');store.pauseRun(pause,context);store.pauseRun(pause,context);
 assert.throws(()=>store.pauseRun({...pause,expectedRevision:99},context),fail('identity_conflict'));
 assert.throws(()=>store.beginEffect(claim),fail('effect_blocked'));assert.equal(store.controlStatus(plan.run.id).reserved,true);
 const base=new SqliteStore(root);t.after(()=>base.close());const run=store.get('run',plan.run.id);
 assert.throws(()=>base.commit([{record:{...run,paused:false,revision:run.revision+1},expectedRevision:run.revision}],context),fail('recovery_required'));
 store.resumeRun(control(store,plan,'resume'),context);store.beginEffect(claim);
 assert.equal(store.get('operation',plan.operation.id).state,'running');
});
test('pause during async validation forbids start without consuming retry budget',async t=>{
 const {store,plan}=fixture(t);let release,starts=0;
 const adapter={async validate(){await new Promise(r=>release=r);},async start(){starts++;return bound(plan,'succeeded');},async reconcile(){throw Error();}};
 const worker=createWorker(store,options(plan,adapter));await worker.tick();
 store.pauseRun(control(store,plan,'pause'),context);release();await worker.drain();
 assert.equal(starts,0);assert.equal(store.delivery(`operation:${plan.operation.id}`).attempts,0);
 assert.equal(store.delivery(`operation:${plan.operation.id}`).state,'pending');
});
for(const claimed of [false,true])test(`cancel before boundary retires intent and claim (claimed=${claimed})`,t=>{
 const {store,plan}=fixture(t);const claim=claimed?store.claim(plan.operation.id,'executor','attempt'):null;
 const c=control(store,plan,'cancel');store.cancelRun(c,context);store.cancelRun(c,context);
 assert.equal(store.get('operation',plan.operation.id).state,'cancelled');assert.equal(store.get('run',plan.run.id).state,'cancelled');
 assert.equal(store.controlStatus(plan.run.id).reserved,false);assert.deepEqual(store.dueCancellations(),[]);
 if(claim)assert.throws(()=>store.beginEffect(claim),fail('effect_consumed'));
});
for(const mode of ['unsupported','requested','lost','cancelled','succeeded'])test(`in-flight cancellation preserves actual outcome: ${mode}`,async t=>{
 const {store,plan,root}=fixture(t);const claim=running(store,plan);store.cancelRun(control(store,plan,'cancel'),context);let cancels=0;
 const adapter={async validate(){},async start(){throw Error();},async reconcile(){return bound(plan,'succeeded');}};
 if(mode!=='unsupported')adapter.cancel=async(request,handle)=>{cancels++;assert.equal(handle,'original-handle');if(mode==='lost')throw Error('lost reply');return bound(plan,['cancelled','succeeded'].includes(mode)?mode:'accepted');};
 const worker=createControlWorker(store,options(plan,adapter));await worker.tick();await worker.drain();await worker.tick();await worker.drain();assert.equal(cancels,mode==='unsupported'?0:1);
 if(!['cancelled','succeeded'].includes(mode)){
  assert.equal(store.get('run',plan.run.id).state,'queued');assert.equal(store.controlStatus(plan.run.id).reserved,true);
  const reboot=startCoordinator(root);t.after(()=>reboot.store.close());assert.equal(reboot.store.controlStatus(plan.run.id).cancelRequested,true);
  store.acceptResult(bound(plan,'succeeded'),claim,1);
 }
 assert.equal(store.get('run',plan.run.id).state,'cancelled');assert.equal(store.get('operation',plan.operation.id).state,mode==='cancelled'?'cancelled':'succeeded');
});
test('terminal state cannot be used to release a still unresolved run',t=>{
 const {store,root,plan}=fixture(t);running(store,plan);const base=new SqliteStore(root);t.after(()=>base.close());const run=store.get('run',plan.run.id);
 assert.throws(()=>base.commit([{record:{...run,state:'cancelled',revision:run.revision+1},expectedRevision:run.revision}],context),fail('recovery_required'));
 assert.equal(store.controlStatus(plan.run.id).reserved,true);
});
test('cancel racing with successful completion retains success and rejects stale stop dispatch',async t=>{
 const {store,plan}=fixture(t);const claim=running(store,plan);store.cancelRun(control(store,plan,'cancel'),context);
 store.acceptResult(bound(plan,'succeeded'),claim,1);assert.deepEqual(store.dueCancellations(),[]);
 assert.throws(()=>store.beginCancellation(plan.operation.id),fail('effect_consumed'));assert.equal(store.get('operation',plan.operation.id).state,'succeeded');
});
for(const boundary of ['boundary','effect'])test(`real process death at cancellation ${boundary} never resends stop`,async t=>{
 const {root,store,plan}=fixture(t);const {fork}=await import('node:child_process');const {once}=await import('node:events');const {DatabaseSync}=await import('node:sqlite');
 const message=async p=>(await once(p,'message',{signal:AbortSignal.timeout(10000)}))[0];
 const child=(file,args)=>{const p=fork(new URL(`./helpers/${file}`,import.meta.url),args,{stdio:['ignore','pipe','pipe','ipc']});p.exited=once(p,'exit');t.after(async()=>{if(p.exitCode===null&&p.signalCode===null){p.kill('SIGKILL');await p.exited;}});return p;};
 const targetDb=join(root,'target.sqlite');const receiver=child('effect-target.mjs',[targetDb]);const {url}=await message(receiver);
 const claim=store.claim(plan.operation.id,'original','original');store.beginEffect(claim);
 const accepted=await(await fetch(url+'/start',{method:'POST',headers:{'x-pending':'1'},body:JSON.stringify(plan.operation.request)})).json();store.acceptResult(accepted,claim,1);
 store.cancelRun(control(store,plan,'cancel'),context);
 const process=child('control-process.mjs',[boundary,root,url]);await message(process);const reached=message(process);process.send('go');assert.equal((await reached).stage,boundary);process.kill('SIGKILL');await process.exited;
 const reboot=startCoordinator(root);t.after(()=>reboot.store.close());let stops=0;
 const adapter={async validate(){},async start(){throw Error();},async cancel(){stops++;throw Error();},async reconcile(request){return(await fetch(url+'/observe',{method:'POST',body:JSON.stringify(request)})).json();}};
 const controller=createControlWorker(reboot.store,options(plan,adapter));await controller.tick();await controller.drain();assert.equal(stops,0);
 const worker=createWorker(reboot.store,options(plan,adapter));await worker.tick();await worker.drain();
 const db=new DatabaseSync(targetDb);assert.equal(db.prepare('SELECT count(*) AS n FROM cancels').get().n,boundary==='effect'?1:0);db.close();
 assert.equal(reboot.store.get('operation',plan.operation.id).state,boundary==='effect'?'cancelled':'outcome_unknown');
 assert.equal(reboot.store.controlStatus(plan.run.id).reserved,boundary!=='effect');
});
test('diagnostics inspect legacy lifecycle records without inventing execution bindings',async t=>{
 const root=mkdtempSync(join(tmpdir(),'labstride-legacy-status-'));const {store}=startCoordinator(root);t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
 const {fixtureRecords}=await import('./helpers/lifecycle-fixture.mjs');const records=fixtureRecords();store.commit(records.map(record=>({record,expectedRevision:null})),context);
 const status=store.controlStatus(records.find(r=>r.kind==='run').id);assert.equal(status.operations[0].delivery,null);assert.equal(status.reserved,false);assert.equal(status.queueReason,'awaiting_admission');
});
