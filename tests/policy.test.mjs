import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { startCoordinator } from '../apps/coordinator/main.ts';
import { createLocalPolicyAuthority } from '../packages/core/policy.ts';
import { configurationFixture, observation, planFor, context, localAuthority, fixtureActorEvidence, policyFor } from './helpers/configuration-fixture.mjs';
import { createWorker, actionKey } from '../packages/core/worker.ts';
import { createControlWorker } from '../packages/core/control-worker.ts';
import { enroll, hook, observation as sessionObservation } from './helpers/observation-fixture.mjs';
import { migrations, migrate } from '../packages/storage-sqlite/migrations.ts';
const fail = code => error => error.code === code;
async function setup(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(),'labstride-policy-')), f = configurationFixture(root);
  const result = await f.compile(); assert.equal(result.ok,true);
  const compiled = result.configuration, observed = observation(f,compiled), registry = new Map();
  registry.set(observed.event.externalId,fixtureActorEvidence(observed,f.source));
  const dependencies = { policyAuthority:localAuthority, actorVerifier: input => registry.get(input.event.externalId) ?? null, ...options.dependencies };
  const stores=[];
  const open = () => {const {store}=startCoordinator(join(root,'state'),dependencies);stores.push(store);return store;};
  const store=open();
  t.after(()=>{for(const s of stores)s.close();rmSync(root,{recursive:true,force:true});});
  store.activateConfiguration(compiled,null,context,localAuthority);
  const policy=policyFor(f,compiled);options.policy?.(policy);
  if(!options.noPolicy)store.applyPolicyChange({schemaVersion:'1.0',id:'initial',installationId:f.config.installationId,expectedRevision:0,change:{kind:'publish',policy}},localAuthority,context);
  const admit=(o=observed,builder=planFor(f,compiled))=>store.requestConfiguredStart(compiled,o,{source:f.source},builder,{...context,actorId:o.event.actorId});
  const change=(value, id=crypto.randomUUID(), expectedRevision=store.policyStatus(f.config.installationId)?.revision??0)=>{
    const request={schemaVersion:'1.0',id,installationId:f.config.installationId,expectedRevision,change:value};
    return store.applyPolicyChange(request,localAuthority,context);
  };
  const restrict=(overrides={})=>change({kind:'restrict',runId:null,paused:false,actorIds:[],repositoryIds:[],targetIds:[],actions:[],...overrides});
  const counts=()=>{const db=new DatabaseSync(join(root,'state/state.sqlite'));try{return ['requests','runs','workspaces','operations','outbox','deliveries'].map(name=>db.prepare(`SELECT count(*) AS n FROM ${name}`).get().n);}finally{db.close();}};
  return {root,f,compiled,observed,registry,dependencies,store,open,policy,admit,change,restrict,counts};
}
function op(x){return x.store.get('operation','op-example-001');}
function bound(x,status='accepted'){const operation=op(x);return {schemaVersion:'1.0',kind:'result',operationId:operation.id,requestDigest:operation.request.requestDigest,
  result:{status,handle:'original',resources:[],outputs:{},evidenceRefs:['test:independent-target'],error:null}};}
function control(x,command){const run=x.store.get('run','run-example-001');return {schemaVersion:'1.0',id:crypto.randomUUID(),runId:run.id,command,expectedRevision:run.revision};}
function options(adapter){return {executorId:'policy-test',nextAttempt:()=>crypto.randomUUID(),adapters:new Map([[actionKey('test.action','1.0.0'),adapter]])};}

test('only the installation bootstrap capability may activate configuration or publish policy; audit and JSON are insufficient',async t=>{
 const x=await setup(t);const request={schemaVersion:'1.0',id:'forged',installationId:x.f.config.installationId,expectedRevision:1,change:{kind:'publish',policy:x.policy}};
 for(const authority of [undefined,context,{},structuredClone(localAuthority),createLocalPolicyAuthority()]) {
  assert.throws(()=>x.store.applyPolicyChange(request,authority,context),fail('effect_blocked'));
  assert.throws(()=>x.store.activateConfiguration(x.compiled,1,context,authority),fail('effect_blocked'));
 }
 assert.equal(x.store.policyStatus(x.f.config.installationId).revision,1);
});
for(const [name,options,alter,code] of [
 ['unapproved actor',{policy:p=>p.actorIds=[]},()=>{},'actor_denied'],
 ['missing policy',{noPolicy:true},()=>{},'policy_missing'],
 ['missing verifier',{dependencies:{actorVerifier:undefined}},()=>{},'actor_unverified'],
 ['forged actor',{},x=>x.observed.event.actorId='foreign','actor_unverified'],
 ['missing provider provenance',{},x=>x.registry.clear(),'actor_unverified'],
 ['wrong repository ID',{policy:p=>{p.repositories[0].id='foreign';p.grants=[];}},()=>{},'repository_denied'],
 ['renamed or redirected repository',{policy:p=>p.repositories[0].name='foreign/repo'},()=>{},'repository_denied'],
 ['no bounded action grant',{policy:p=>p.grants=[]},()=>{},'operation_denied'],
 ['wrong target grant',{policy:p=>p.grants[0].targetId='foreign'},()=>{},'operation_denied'],
 ['wrong version grant',{policy:p=>p.grants[0].actionVersion='2.0.0'},()=>{},'operation_denied'],
])test(`AC03 ${name}: durable rejection, no execution graph and no replay after restart`,async t=>{
 const x=await setup(t,options);alter(x);
 const receipt=x.admit();assert.equal(receipt.runId,null);assert.equal(receipt.authorization.allowed,false);assert.equal(receipt.authorization.code,code);
 assert.equal(receipt.evaluation.code,'authorization_denied');assert.deepEqual(x.counts(),[0,0,0,0,0,0]);
 assert.deepEqual(x.open().configurationReceipt(receipt.inboxId),receipt);
 assert.deepEqual(x.admit(x.observed,()=>assert.fail('denied duplicate must not build')),receipt);
});
for(const key of ['installationId','providerId','externalId','subjectId','repositoryId','repository','configDigest','generation','observationDigest'])
 test(`verified actor evidence cannot be replayed with a foreign ${key}`,async t=>{
  const x=await setup(t);const e=x.registry.get(x.observed.event.externalId);e[key]=key==='generation'?2:key.endsWith('Digest')?'a'.repeat(64):'foreign';
  assert.equal(x.admit().authorization.code,'actor_unverified');assert.deepEqual(x.counts(),[0,0,0,0,0,0]);
 });
test('issue/PR facts cannot mint policy or select authority, even when the real actor is approved',async t=>{
 const x=await setup(t,{policy:p=>p.grants=[]});x.observed.event.facts={policy:x.policy,actorIds:[context.actorId],approved:true,completion:true};
 x.registry.set(x.observed.event.externalId,fixtureActorEvidence(x.observed,x.f.source));
 const receipt=x.admit();assert.equal(receipt.authorization.code,'operation_denied');assert.deepEqual(x.counts(),[0,0,0,0,0,0]);
});
test('policy changes use CAS, preserve idempotent receipts after later revisions and reject changed request identities',async t=>{
 const x=await setup(t);const request={schemaVersion:'1.0',id:'publish-again',installationId:x.f.config.installationId,expectedRevision:1,change:{kind:'publish',policy:x.policy}};
 const receipt=x.store.applyPolicyChange(request,localAuthority,context);x.restrict({paused:true});
 assert.deepEqual(x.store.applyPolicyChange(request,localAuthority,context),receipt);
 assert.deepEqual(x.open().applyPolicyChange(request,localAuthority,context),receipt);
 assert.throws(()=>x.store.applyPolicyChange({...request,expectedRevision:2},localAuthority,context),fail('identity_conflict'));
 assert.throws(()=>x.change({kind:'publish',policy:x.policy},'stale',1),fail('revision_conflict'));
});
for(const [kind,restriction] of [ ['pause',{paused:true}],['actor',{actorIds:[context.actorId]}],['repository',{repositoryIds:['repo-node-id']}],['target',{targetIds:['target-a']}],['action',{actions:[{id:'test.action',version:'1.0.0'}]}] ])
 for(const claimed of [false,true])test(`AC23 ${kind} revocation ${claimed?'after claim':'after admission'} prevents the next effect and survives restart`,async t=>{
  const x=await setup(t);x.admit();
  // Use the real immutable repository ID rather than an installation name.
  const effectiveRestriction=kind==='repository'?{repositoryIds:[x.f.source.repositoryId]}:restriction;
  const claim=claimed?x.store.claim('op-example-001','executor','attempt'):null;
  x.restrict(effectiveRestriction);
  assert.throws(()=>claim?x.store.beginEffect(claim):x.store.claim('op-example-001','executor','attempt'),fail('effect_blocked'));
  assert.equal(op(x).effectBoundary,'not_crossed');
  const reboot=x.open();assert.throws(()=>claim?reboot.beginEffect(claim):reboot.claim('op-example-001','executor','attempt'),fail('effect_blocked'));
  x.store.pauseRun(control(x,'pause'),context,localAuthority);x.store.resumeRun(control(x,'resume'),context,localAuthority);
  assert.throws(()=>claim?x.store.beginEffect(claim):x.store.claim('op-example-001','executor','attempt'),fail('effect_blocked'));
 });
test('revocation during asynchronous validation prevents worker start and leaves target database untouched',async t=>{
 const x=await setup(t);x.admit();const db=new DatabaseSync(join(x.root,'target.sqlite'));t.after(()=>db.close());db.exec('CREATE TABLE effects (id TEXT)');let release;
 const worker=createWorker(x.store,options({async validate(){await new Promise(r=>release=r);},async start(){db.exec("INSERT INTO effects VALUES ('unexpected')");return bound(x,'succeeded');},async reconcile(){return bound(x,'succeeded');}}));
 await worker.tick();x.restrict({targetIds:['target-a']});release();await worker.drain();await worker.close();
 assert.equal(db.prepare('SELECT count(*) AS n FROM effects').get().n,0);assert.equal(op(x).effectBoundary,'not_crossed');
});
test('ordinary publication cannot expand active permissions; only an explicit audited run binding can',async t=>{
 const x=await setup(t);x.admit();const claim=x.store.claim('op-example-001','executor','attempt');x.store.beginEffect(claim);x.store.acceptResult(bound(x),claim,1);
 const expanded=structuredClone(x.policy);expanded.grants[0].effects=['execute'];
 const narrow=x.change({kind:'publish',policy:expanded});x.change({kind:'bind_run',runId:'run-example-001',policyRevision:narrow.policyRevision});
 x.store.cancelRun(control(x,'cancel'),context,localAuthority);assert.throws(()=>x.store.beginCancellation('op-example-001'),fail('effect_blocked'));
 const wider=x.change({kind:'publish',policy:x.policy});assert.throws(()=>x.store.beginCancellation('op-example-001'),fail('effect_blocked'));
 x.change({kind:'bind_run',runId:'run-example-001',policyRevision:wider.policyRevision});x.store.beginCancellation('op-example-001');
 assert.equal(x.store.controlStatus('run-example-001').cancellations[0].state,'outcome_unknown');
});
test('revocation blocks cancellation but permits independent outcome reconciliation and audit',async t=>{
 const x=await setup(t);x.admit();const claim=x.store.claim('op-example-001','executor','attempt');x.store.beginEffect(claim);x.store.acceptResult(bound(x),claim,1);
 x.store.cancelRun(control(x,'cancel'),context,localAuthority);x.restrict({targetIds:['target-a']});let cancels=0,reads=0;
 const adapter={async validate(){},async start(){assert.fail('must never replay');},async cancel(){cancels++;return bound(x,'cancelled');},async reconcile(){reads++;return bound(x,'succeeded');}};
 const controlWorker=createControlWorker(x.store,options(adapter));await controlWorker.tick();await controlWorker.drain();assert.equal(cancels,0);
 const worker=createWorker(x.store,options(adapter));await worker.tick();await worker.drain();assert.equal(reads,1);assert.equal(op(x).state,'succeeded');
 assert.equal(x.store.configurationReceipt(x.admit().inboxId).authorization.allowed,true); // Original admission decision is historical.
 await worker.close();await controlWorker.close();
});
test('AC35 slice: hook approval/completion cannot change policy; valid hooks and backend reads continue under revocation',async t=>{
 const x=await setup(t);x.admit();const session=enroll(x.store);x.restrict({paused:true});const before=x.store.policyStatus(x.f.config.installationId);
 for(const patch of [{kind:'plan.approved'},{kind:'run.completed'},{approval:true},{policy:x.policy},{sessionId:'foreign'},{requestGeneration:2}])
  assert.throws(()=>x.store.receiveHook(session.id,{...hook(session),...patch}));
 assert.equal(x.store.receiveHook(session.id,hook(session)).outcome,'accepted');
 x.store.bootObservations();const poll=x.store.dueSessions()[0];x.store.applySession(poll,session.revision,sessionObservation(session),60000);
 assert.deepEqual(x.store.policyStatus(x.f.config.installationId),before);assert.equal(x.store.get('run',session.runId).state,'queued');
 assert.throws(()=>x.store.claim('op-example-001','executor','attempt'),fail('effect_blocked'));
});
test('configured low-level scheduleStart cannot bypass verified actor admission even with a correct snapshot and allowed audit actor',async t=>{
 const x=await setup(t);const plan={...planFor(x.f,x.compiled)(x.compiled.bindWorkflow('prepare',x.observed.current,{source:x.f.source}),x.observed),configurationSnapshot:x.compiled.snapshot};
 const input={schemaVersion:'1.0',stream:'bypass',checkpoint:null,event:{...x.observed.event,kind:'start.requested',facts:{generation:1}}};
 assert.throws(()=>x.store.scheduleStart(x.store.receive(input).id,plan,context),fail('effect_blocked'));assert.deepEqual(x.counts(),[0,0,0,0,0,0]);
});
test('v10 migration invents no policy authority and preserves all previous migration checksums',t=>{
 const root=mkdtempSync(join(tmpdir(),'labstride-policy-migrate-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const db=new DatabaseSync(join(root,'v10.sqlite'));t.after(()=>db.close());migrate(db,migrations.slice(0,10));const checksums=db.prepare('SELECT * FROM schema_migrations').all();migrate(db);
 assert.deepEqual(db.prepare('SELECT * FROM schema_migrations WHERE version<=10').all(),checksums);assert.equal(db.prepare('SELECT count(*) AS n FROM policy_state').get().n,0);
});
for(const stage of ['before','after'])test(`real SIGKILL ${stage} policy commit preserves one revision and permits receipt recovery`,async t=>{
 const x=await setup(t);const request={schemaVersion:'1.0',id:'crash-change',installationId:x.f.config.installationId,expectedRevision:1,change:{kind:'restrict',runId:null,paused:true,actorIds:[],repositoryIds:[],targetIds:[],actions:[]}};
 const path=join(x.root,'change.json');writeFileSync(path,JSON.stringify(request));
 const child=fork(new URL('./helpers/policy-process.mjs',import.meta.url),[join(x.root,'state'),path,stage],{stdio:['ignore','pipe','pipe','ipc']});const exited=once(child,'exit');let err='';child.stderr.on('data',data=>err+=data);
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}});
 const ready=await once(child,'message',{signal:AbortSignal.timeout(10000)});assert.equal(ready[0].stage,stage,err);child.kill('SIGKILL');await exited;
 const reboot=x.open();assert.equal(reboot.policyStatus(x.f.config.installationId).revision,stage==='before'?1:2);
 assert.equal(reboot.applyPolicyChange(request,localAuthority,context).revision,2);assert.equal(reboot.policyStatus(x.f.config.installationId).revision,2);
 assert.equal(reboot.requestConfiguredStart(x.compiled,x.observed,{source:x.f.source},planFor(x.f,x.compiled),context).authorization.code,'policy_paused');
});

test('configured controls and budget renewal require operator capability, not a caller-supplied audit identity',async t=>{
 const x=await setup(t);x.admit();
 for(const command of ['pause','resume','takeover','cancel'])assert.throws(()=>x.store[`${command}Run`](control(x,command),context),fail('effect_blocked'));
 assert.throws(()=>x.store.updateRunBudget({schemaVersion:'1.0',id:'budget',runId:'run-example-001',expectedRevision:1,maxRepairs:10,unattendedMs:86400000},context),fail('effect_blocked'));
 assert.equal(op(x).effectBoundary,'not_crossed');
});
test('operator input validates before policy effects, including unknown keys and unrecognized effect names',async t=>{
 const x=await setup(t);const before=x.store.policyStatus(x.f.config.installationId);
 for(const mutate of [p=>p.extra=true,p=>p.expectedRevision=-1,p=>p.change.policy.grants[0].effects=['shell'],p=>p.change.policy.grants[0].repositoryId='unmapped']) {
  const request={schemaVersion:'1.0',id:crypto.randomUUID(),installationId:x.f.config.installationId,expectedRevision:1,change:{kind:'publish',policy:structuredClone(x.policy)}};
  mutate(request);assert.throws(()=>x.store.applyPolicyChange(request,localAuthority,context),fail('invalid_payload'));
 }
 assert.deepEqual(x.store.policyStatus(x.f.config.installationId),before);
});
test('revoked policy prevents follow-up scheduling before an executable outbox record is persisted',async t=>{
 const x=await setup(t);x.admit();const claim=x.store.claim('op-example-001','executor','attempt');x.store.beginEffect(claim);x.store.acceptResult(bound(x,'succeeded'),claim,1);
 const plan=planFor(x.f,x.compiled)(x.compiled.bindWorkflow('prepare',x.observed.current,{source:x.f.source}),x.observed);
 plan.operation.id='follow-up';plan.operation.request.operationId='follow-up';plan.outbox.id='follow-up-outbox';plan.outbox.operationId='follow-up';plan.outbox.intentKey='follow-up';plan.outbox.payload.operationId='follow-up';
 const {requestDigest}=await import('../packages/storage-sqlite/execution.ts');plan.operation.request.requestDigest=requestDigest(plan.operation.request);
 x.restrict({targetIds:['target-a']});assert.throws(()=>x.store.scheduleOperation(plan,context),fail('effect_blocked'));
 assert.deepEqual(x.counts().slice(0,5),[1,1,1,1,1]);assert.equal(x.store.operationAuthorization('op-example-001').code,'operation_denied');
});
test('run-specific pause does not pause another authorized request in the installation',async t=>{
 const x=await setup(t);const first=x.admit();x.restrict({runId:first.runId,paused:true});
 const other=structuredClone(x.observed);other.event.eventId=other.event.externalId='other-event';other.event.subjectId='other-issue';
 x.registry.set(other.event.externalId,fixtureActorEvidence(other,x.f.source));
 const second=x.admit(other,planFor(x.f,x.compiled,'-other'));assert.ok(second.runId);
 assert.equal(x.store.operationAuthorization('op-example-001').code,'policy_paused');
 assert.equal(x.store.operationAuthorization('op-example-001-other').allowed,true);
});
test('policy content is immutable and a corrupted persisted revision cannot grant an effect',async t=>{
 const x=await setup(t);x.admit();const db=new DatabaseSync(join(x.root,'state/state.sqlite'));t.after(()=>db.close());
 assert.throws(()=>db.exec("UPDATE policy_revisions SET payload='{}'"),/immutable_policy/);
 db.exec('DROP TRIGGER policy_revision_no_update');
 const altered=structuredClone(x.policy);altered.actorIds.push('untrusted');db.prepare('UPDATE policy_revisions SET payload=?').run(JSON.stringify(altered));
 assert.throws(()=>x.store.claim('op-example-001','executor','attempt'),fail('effect_blocked'));assert.equal(op(x).effectBoundary,'not_crossed');
});
test('v10 configured runs retain identity after upgrade but acquire no invented authorization',async t=>{
 const x=await setup(t);const receipt=x.admit();
 const db=new DatabaseSync(join(x.root,'state/state.sqlite'));
 db.exec('PRAGMA foreign_keys=OFF; DROP TABLE authorization_decisions; DROP TABLE policy_restrictions; DROP TABLE run_authorizations; DROP TABLE policy_changes; DROP TABLE policy_state; DROP TABLE policy_revisions; DELETE FROM schema_migrations WHERE version=11; PRAGMA user_version=10');db.close();
 const reboot=x.open();assert.equal(reboot.runConfiguration(receipt.runId).digest,x.compiled.snapshot.digest);
 assert.equal(reboot.policyStatus(x.f.config.installationId),null);assert.throws(()=>reboot.claim('op-example-001','executor','attempt'),fail('effect_blocked'));
 assert.equal(reboot.get('operation','op-example-001').id,'op-example-001');
});

test('a restriction committed by another coordinator connection is checked at the original claim boundary',async t=>{
 const x=await setup(t);x.admit();const claim=x.store.claim('op-example-001','executor','attempt');
 const other=x.open();other.applyPolicyChange({schemaVersion:'1.0',id:'external-revoke',installationId:x.f.config.installationId,expectedRevision:1,
  change:{kind:'restrict',runId:null,paused:false,actorIds:[],repositoryIds:[],targetIds:['target-a'],actions:[]}},localAuthority,context);
 assert.throws(()=>x.store.beginEffect(claim),fail('effect_blocked'));
 assert.equal(x.store.operationAuthorization('op-example-001').code,'operation_denied');
 const history=x.store.policyHistory(x.f.config.installationId);assert.equal(history.length,2);assert.equal(history[1].request.id,'external-revoke');assert.deepEqual(history[1].context,context);
});
test('emergency pause blocks a configured projection effect while reads and historical receipts remain available',async t=>{
 const x=await setup(t);const {startPlan}=await import('./helpers/execution-fixture.mjs');
 const builder=planFor(x.f,x.compiled);const receipt=x.admit(x.observed,(...args)=>{const p=builder(...args);p.projections=startPlan().projections;for(const projection of p.projections)projection.providerId=p.request.providerId;return p;});
 assert.equal(x.store.projectionAllowed(receipt.runId),true);x.restrict({paused:true});assert.equal(x.store.projectionAllowed(receipt.runId),false);
 const projection=x.store.get('projection',startPlan().projections[0].id);
 const view={schemaVersion:'1.0',providerId:projection.providerId,subjectId:projection.subjectId,fieldId:projection.fieldId,generation:1,version:projection.payload.expectedFingerprint,value:'old',appliedToken:null};
 const delivery=x.store.delivery(`projection:${projection.id}`);assert.equal(x.store.inspectProjection(projection.id,delivery.revision,view),'wait');
 assert.throws(()=>x.store.beginProjection(projection.id,delivery.revision,view),fail('effect_blocked'));
 assert.deepEqual(x.store.configurationReceipt(receipt.inboxId),receipt);
});
