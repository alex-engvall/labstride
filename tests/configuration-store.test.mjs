import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { configurationFixture, observation, planFor, context } from './helpers/configuration-fixture.mjs';
import { startCoordinator } from '../apps/coordinator/main.ts';
import { createWorker, actionKey } from '../packages/core/worker.ts';
import { freezeProfile, loadExtension } from '../packages/extensions/loader.ts';
import { migrate, migrations } from '../packages/storage-sqlite/migrations.ts';
import { fixtureRecords } from './helpers/lifecycle-fixture.mjs';
import { seed, startPlan, eventInput } from './helpers/execution-fixture.mjs';
import { provider } from './helpers/observation-fixture.mjs';
import { createObservationWorker } from '../packages/core/observation-worker.ts';
import { requestDigest } from '../packages/storage-sqlite/execution.ts';

const failure = code => e => e.code === code;
function root(t){const path=mkdtempSync(join(tmpdir(),'labstride-config-store-'));t.after(()=>rmSync(path,{recursive:true,force:true}));return path;}
function open(t,path){const runtime=startCoordinator(path);t.after(()=>runtime.store.close());return runtime.store;}
async function setup(t,mutate=()=>{}){
 const path=root(t),f=configurationFixture(path,'a');mutate(f);const result=await f.compile();assert.equal(result.ok,true,JSON.stringify(result.diagnostics));
 const compiled=result.configuration,store=open(t,join(path,'state'));store.activateConfiguration(compiled,null,context);
 return {path,f,compiled,store,observed:observation(f,compiled),bindings:{source:f.source}};
}
function request(x,observed=x.observed,builder=planFor(x.f,x.compiled)) {return x.store.requestConfiguredStart(x.compiled,observed,x.bindings,builder,context);}
function counts(storePath){const db=new DatabaseSync(join(storePath,'state.sqlite'));try{return Object.fromEntries(['requests','runs','operations','outbox','deliveries','rule_evaluations'].map(table=>[table,db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n]));}finally{db.close();}}
async function actionWorker(x,store=x.store){
 const pin=x.compiled.snapshot.extensionLock.extensions.find(p=>p.kind==='action');
 const profile=freezeProfile('run-example-001',x.compiled.snapshot.digest,pin,x.f.dependencies.host);
 const loaded=await loadExtension(profile,x.f.dependencies.host);
 return createWorker(store,{executorId:'configuration-test',nextAttempt:()=>crypto.randomUUID(),adapters:new Map([[actionKey(pin.id,pin.version),loaded.instance]])});
}

test('preflight activation is audited and idempotent; arbitrary snapshots cannot activate an installation',async t=>{
 const x=await setup(t);assert.equal(x.store.get('installation',x.f.config.installationId).revision,1);
 assert.equal(x.store.activateConfiguration(x.compiled,null,context),x.compiled.snapshot.digest);
 assert.equal(x.store.get('installation',x.f.config.installationId).revision,1);
 assert.throws(()=>x.store.activateConfiguration({snapshot:x.compiled.snapshot},1,context),e=>e.code==='configuration_invalid');
 assert.throws(()=>x.store.activateConfiguration(x.compiled,99,context),failure('revision_conflict'));
 const installation=x.store.get('installation',x.f.config.installationId);
 assert.throws(()=>x.store.commit([{record:{...installation,configRevision:'forged',revision:2},expectedRevision:1}],context),failure('recovery_required'));
 assert.equal(x.store.schedulingPolicy().activeRuns,x.f.config.limits.activeRuns);
});
test('one configured transition retains its snapshot, ordered workflow and original identities across duplicate delivery and restart',async t=>{
 const x=await setup(t);const first=request(x);assert.equal(first.evaluation.outcome,'matched');
 const repeated=structuredClone(x.observed);repeated.event.observedAt='2026-10-23T12:00:00Z';
 assert.deepEqual(request(x,repeated,()=>assert.fail('duplicate must not build again')),first);
 const reboot=open(t,join(x.path,'state'));
 assert.deepEqual(reboot.configurationReceipt(first.inboxId),first);
 assert.deepEqual(reboot.runConfiguration(first.runId),x.compiled.snapshot);
 assert.equal(reboot.get('operation','op-example-001').request.configDigest,x.compiled.snapshot.digest);
 assert.deepEqual(counts(join(x.path,'state')),{requests:1,runs:1,operations:1,outbox:1,deliveries:1,rule_evaluations:1});
 const changed=structuredClone(x.observed);changed.current.note.value='different under same event ID';assert.throws(()=>request(x,changed),failure('identity_conflict'));
});
test('later workflow steps retain typed bindings until their recorded context is available',async t=>{
 const x=await setup(t,f=>f.config.workflows.prepare.push({id:'release',action:'test.action',inputs:{target:'target-a',source:'context.source',note:'context.mergeSha'}}));
 const receipt=request(x);assert.equal(receipt.evaluation.outcome,'matched');
 const snapshot=x.store.runConfiguration(receipt.runId);assert.equal(snapshot.configuration.workflows.prepare[1].inputs.note,'context.mergeSha');
 assert.throws(()=>x.compiled.bindStep('prepare','release',x.observed.current,x.bindings),e=>e.code==='binding_invalid');
 const next=x.compiled.bindStep('prepare','release',x.observed.current,{...x.bindings,mergeSha:'b'.repeat(40)});assert.equal(next.inputs.note,'b'.repeat(40));
});
for(const [name,mutate,expected] of [
 ['historical match',o=>o.initialSync=true,'no_match'],
 ['unchanged start',o=>o.previous.request=structuredClone(o.current.request),'no_match'],
 ['own projection',o=>o.event.origin='coordinator','no_match'],
 ['unknown model option',o=>o.current.request.value='unmapped','blocked'],
])test(`durable ${name} decision has no execution intent`,async t=>{
 const x=await setup(t);mutate(x.observed);const receipt=request(x,x.observed,()=>assert.fail('must not build'));
 assert.equal(receipt.evaluation.outcome,expected);assert.equal(receipt.runId,null);
 const reboot=open(t,join(x.path,'state'));assert.deepEqual(reboot.configurationReceipt(receipt.inboxId),receipt);
 assert.deepEqual(counts(join(x.path,'state')),{requests:0,runs:0,operations:0,outbox:0,deliveries:0,rule_evaluations:1});
});
test('AC26 scoped proof: historical imports and overlapping start rules remain inert across restart',async t=>{
 const x=await setup(t,f=>f.config.rules.push({id:'overlap',event:'field.changed',condition:{all:[structuredClone(f.config.rules[0].condition),{field:'note',op:'exists'}]},workflow:'prepare'}));
 const historical=structuredClone(x.observed);historical.initialSync=true;
 assert.equal(request(x,historical).evaluation.code,'initial_sync');
 x.observed.event.externalId='fresh-transition';x.observed.event.eventId='fresh-transition';
 const receipt=request(x,x.observed,()=>assert.fail('conflict must not build'));
 assert.equal(receipt.evaluation.outcome,'rule_conflict');assert.deepEqual(receipt.evaluation.ruleIds,['start','overlap']);
 const reboot=open(t,join(x.path,'state'));assert.equal(reboot.configurationReceipt(receipt.inboxId).evaluation.outcome,'rule_conflict');
 assert.deepEqual(counts(join(x.path,'state')),{requests:0,runs:0,operations:0,outbox:0,deliveries:0,rule_evaluations:2});
});
test('hostile text reaches only the pinned action as literal data and one durable effect is recovered without replay',async t=>{
 const x=await setup(t),sentinel=join(x.path,'MUST_NOT_BE_CREATED');
 const hostile=`$(touch ${sentinel}); ../outside https://example.invalid/extension.mjs context.source`;
 x.observed.current.note.value=hostile;const receipt=request(x);
 assert.equal(existsSync(x.f.markerPath),false);assert.equal(existsSync(sentinel),false);
 const worker=await actionWorker(x);t.after(()=>worker.close());await worker.tick();await worker.drain();
 assert.equal(x.store.get('operation','op-example-001').state,'succeeded');
 const db=new DatabaseSync(x.f.databasePath);t.after(()=>db.close());
 assert.equal(db.prepare('SELECT count(*) AS n FROM calls').get().n,1);
 assert.equal(JSON.parse(db.prepare('SELECT inputs FROM calls').get().inputs).note,hostile);
 assert.equal(existsSync(sentinel),false);
 const reboot=open(t,join(x.path,'state'));assert.deepEqual(reboot.configurationReceipt(receipt.inboxId),receipt);
 const after=await actionWorker(x,reboot);t.after(()=>after.close());await after.tick();await after.drain();
 assert.equal(db.prepare('SELECT count(*) AS n FROM calls').get().n,1);
 assert.equal(reboot.get('workspace','ws-example-001').state,'requested'); // Recording action performs no SSH/path effects.
});
for(const value of [true,42,'2026-10-23',['option-two','option-one'],null])test(`typed projection value ${JSON.stringify(value)} crosses the existing durable writer without coercion`,async t=>{
 const path=root(t),store=open(t,join(path,'state'));seed(store);const plan=startPlan();plan.projections[0].payload.value=value;
 store.scheduleStart(store.receive(eventInput()).id,plan,context);
 const external=provider(join(path,'provider.sqlite'),plan.projections[0]);t.after(()=>external.close());
 const worker=createObservationWorker(store,{sessions:new Map(),projections:new Map([[plan.projections[0].providerId,external.adapter]])});
 await worker.tick();assert.deepEqual(external.view().value,value);assert.equal(external.count(),1);
 assert.equal(store.delivery(`projection:${plan.projections[0].id}`).state,'done');
});
test('new revisions affect new runs while an active run and its later state changes retain the original snapshot',async t=>{
 const x=await setup(t),original=request(x);const oldDigest=x.compiled.snapshot.digest;
 x.f.config.limits.activeRuns=3;const second=await x.f.compile();assert.equal(second.ok,true);x.store.activateConfiguration(second.configuration,1,context);
 const current=x.store.get('installation',x.f.config.installationId);assert.equal(current.configRevision,second.configuration.snapshot.digest);
 assert.equal(x.store.runConfiguration(original.runId).digest,oldDigest);
 const run=x.store.get('run',original.runId);x.store.commit([{expectedRevision:run.revision,record:{...run,revision:run.revision+1,state:'preparing'}}],context);
 assert.equal(x.store.get('run',original.runId).configRevision,oldDigest);
 // Different issue, not a second generation of a live issue.
 const observed=observation(x.f,second.configuration);observed.event.subjectId='second-issue';observed.event.externalId='second-event';observed.event.eventId='second-event';
 const receipt=x.store.requestConfiguredStart(second.configuration,observed,x.bindings,planFor(x.f,second.configuration,':second'),context);
 assert.equal(x.store.runConfiguration(receipt.runId).digest,second.configuration.snapshot.digest);
 const reboot=open(t,join(x.path,'state'));assert.equal(reboot.runConfiguration(original.runId).digest,oldDigest);
 assert.equal(reboot.runConfiguration(receipt.runId).digest,second.configuration.snapshot.digest);
 // Duplicate original event returns original receipt even when another configuration is active.
 assert.deepEqual(x.store.requestConfiguredStart(second.configuration,x.observed,x.bindings,()=>assert.fail('duplicate'),context),original);
});
test('invalid bound input, altered plans and omitted managed snapshots cannot create execution intent',async t=>{
 const x=await setup(t);x.bindings={};const blocked=request(x);assert.equal(blocked.evaluation.outcome,'blocked');
 assert.equal(counts(join(x.path,'state')).runs,0);
 const other=structuredClone(x.observed);other.event.externalId='other';other.event.eventId='other';x.bindings={source:x.f.source};
 const builder=planFor(x.f,x.compiled);
 assert.throws(()=>request(x,other,(...args)=>{const plan=builder(...args);plan.operation.request.actionId='https://example.invalid/install';plan.operation.request.requestDigest=requestDigest(plan.operation.request);return plan;}),failure('identity_conflict'));
 assert.equal(counts(join(x.path,'state')).runs,0);
 const plan=builder(x.compiled.bindWorkflow('prepare',other.current,x.bindings),other);
 const input={schemaVersion:'1.0',stream:'unconfigured-bypass',checkpoint:null,event:{...other.event,kind:'start.requested',facts:{generation:1}}};
 assert.throws(()=>x.store.scheduleStart(x.store.receive(input).id,plan,context),failure('effect_blocked'));
 assert.equal(counts(join(x.path,'state')).runs,0);
});
for(const corrupt of ['missing','changed'])test(`${corrupt} persisted snapshot blocks effects while preserving the original intent`,async t=>{
 const x=await setup(t),receipt=request(x),db=new DatabaseSync(join(x.path,'state/state.sqlite'));t.after(()=>db.close());
 assert.throws(()=>db.exec('DELETE FROM configuration_snapshots'),/immutable_configuration/);
 assert.throws(()=>db.exec("UPDATE configuration_snapshots SET payload='{}'"),/immutable_configuration/);
 db.exec('PRAGMA foreign_keys=OFF'); // Deliberately simulate external database corruption beyond normal APIs.
 db.exec(`DROP TRIGGER configuration_snapshot_no_${corrupt==='missing'?'delete':'update'}`);
 if(corrupt==='missing')db.prepare('DELETE FROM configuration_snapshots WHERE digest=?').run(x.compiled.snapshot.digest);
 else db.prepare("UPDATE configuration_snapshots SET payload=json_set(payload,'$.configuration.limits.activeRuns',99) WHERE digest=?").run(x.compiled.snapshot.digest);
 assert.throws(()=>x.store.claim('op-example-001','executor','attempt'),failure('effect_blocked'));
 assert.equal(x.store.get('operation','op-example-001').effectBoundary,'not_crossed');
 assert.equal(x.store.configurationReceipt(receipt.inboxId).runId,receipt.runId);
});
test('v9 migration preserves legacy runs and handles without inventing configuration evidence',async t=>{
 const path=root(t),state=join(path,'legacy');
 mkdirSync(state);const db=new DatabaseSync(join(state,'state.sqlite'));migrate(db,migrations.slice(0,9));
 const records=fixtureRecords().filter(record=>['installation','request','run','workspace','operation','outbox'].includes(record.kind));
 const tables={installation:'installations',request:'requests',run:'runs',workspace:'workspaces',operation:'operations',outbox:'outbox'};
 for(const record of records){if(record.kind==='operation'){record.state='outcome_unknown';record.effectBoundary='crossed';}db.prepare(`INSERT INTO ${tables[record.kind]}(id,payload) VALUES (?,?)`).run(record.id,JSON.stringify(record));}
 const run=records.find(r=>r.kind==='run'),op=records.find(r=>r.kind==='operation');
 const observed={result:{handle:'original-legacy-handle'}};
 db.prepare('INSERT INTO execution_log(operation_id,at,kind,payload) VALUES (?,?,?,?)').run(op.id,op.createdAt,'observation',JSON.stringify(observed));
 const checksums=db.prepare('SELECT * FROM schema_migrations').all();assert.equal(db.prepare('PRAGMA user_version').get().user_version,9);db.close();
 const reboot=open(t,state);assert.equal(reboot.get('operation',op.id).state,'outcome_unknown');assert.equal(reboot.runConfiguration(run.id),null);
 assert.equal(reboot.operationHandle(op.id),'original-legacy-handle');
 const direct=new DatabaseSync(join(state,'state.sqlite'));t.after(()=>direct.close());assert.equal(direct.prepare('PRAGMA user_version').get().user_version,10);
 assert.equal(direct.prepare('SELECT config_digest FROM runs WHERE id=?').get(run.id).config_digest,null);
 assert.deepEqual(direct.prepare('SELECT * FROM schema_migrations WHERE version<=9').all(),checksums);
});

for(const stage of ['inside','committed'])test(`real SIGKILL ${stage} configuration admission recovers all-or-nothing identities`,async t=>{
 const x=await setup(t),fixturePath=join(x.path,'fixture.json');
 writeFileSync(fixturePath,JSON.stringify({configuration:x.f.config,dependencies:{lock:x.f.dependencies.lock,host:x.f.dependencies.host},descriptors:x.f.descriptors,observed:x.observed}));
 const process=fork(new URL('./helpers/configuration-process.mjs',import.meta.url),[join(x.path,'state'),fixturePath,stage],{stdio:['ignore','pipe','pipe','ipc']});
 const exited=once(process,'exit');let stderr='';process.stderr.on('data',data=>stderr+=data);
 t.after(async()=>{if(process.exitCode===null&&process.signalCode===null){process.kill('SIGKILL');await exited;}});
 const ready=(await once(process,'message',{signal:AbortSignal.timeout(10000)}))[0];assert.equal(ready.stage,stage,stderr);
 process.kill('SIGKILL');await exited;
 const reboot=open(t,join(x.path,'state')),before=counts(join(x.path,'state'));
 assert.equal(before.runs,stage==='inside'?0:1);assert.equal(before.rule_evaluations,stage==='inside'?0:1);
 const receipt=reboot.requestConfiguredStart(x.compiled,x.observed,x.bindings,stage==='inside'?planFor(x.f,x.compiled):()=>assert.fail('lost reply must reuse committed plan'),context);
 assert.equal(receipt.runId,'run-example-001');assert.deepEqual(reboot.runConfiguration(receipt.runId),x.compiled.snapshot);
 assert.deepEqual(counts(join(x.path,'state')),{requests:1,runs:1,operations:1,outbox:1,deliveries:1,rule_evaluations:1});
});
for(const stage of ['before_effect','after_effect'])test(`configured snapshot survives real SIGKILL ${stage} without replaying the installed action`,async t=>{
 const x=await setup(t),fixturePath=join(x.path,'fixture.json');
 writeFileSync(fixturePath,JSON.stringify({configuration:x.f.config,dependencies:{lock:x.f.dependencies.lock,host:x.f.dependencies.host},descriptors:x.f.descriptors,observed:x.observed}));
 const child=fork(new URL('./helpers/configuration-process.mjs',import.meta.url),[join(x.path,'state'),fixturePath,stage],{stdio:['ignore','pipe','pipe','ipc']});
 const exited=once(child,'exit');t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}});
 assert.equal((await once(child,'message',{signal:AbortSignal.timeout(10000)}))[0].stage,stage);child.kill('SIGKILL');await exited;
 const reboot=open(t,join(x.path,'state')),worker=await actionWorker(x,reboot);t.after(()=>worker.close());await worker.tick();await worker.drain();
 assert.equal(reboot.runConfiguration('run-example-001').digest,x.compiled.snapshot.digest);
 assert.equal(reboot.get('operation','op-example-001').state,stage==='after_effect'?'succeeded':'outcome_unknown');
 const db=new DatabaseSync(x.f.databasePath);t.after(()=>db.close());assert.equal(db.prepare('SELECT count(*) AS n FROM calls').get().n,stage==='after_effect'?1:0);
 await worker.tick();await worker.drain();assert.equal(db.prepare('SELECT count(*) AS n FROM calls').get().n,stage==='after_effect'?1:0);
});
