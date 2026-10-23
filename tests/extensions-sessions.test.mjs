import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { startCoordinator } from '../apps/coordinator/main.ts';
import { createWorker, actionKey } from '../packages/core/worker.ts';
import { createSessionAction, sessionAction, sessionActionVersion } from '../packages/core/sessions.ts';
import { sessionResolver } from '../packages/extensions/session-provider.ts';
import { freezeProfile, loadExtension } from '../packages/extensions/loader.ts';
import { handoffSession } from '../packages/core/session-runtime.ts';
import { installed, setup, follow, context, host } from './helpers/session-fixture.mjs';
const fail = code => e => e.code === code;
function root(t) { const path=mkdtempSync(join(tmpdir(),'labstride-sessions-'));t.after(()=>rmSync(path,{recursive:true,force:true}));return path; }
function fixture(t) {
  const path=root(t),runtime=startCoordinator(join(path,'state')),resolver=sessionResolver(host),f=setup(runtime.store,path);
  t.after(async()=>{await resolver.close();runtime.store.close();});
  const worker=createWorker(f.store,{executorId:'session-tests',nextAttempt:()=>crypto.randomUUID(),
    adapters:new Map([[actionKey(sessionAction,sessionActionVersion),createSessionAction(f.store,resolver.resolve)]])});
  return {...f,resolver,worker,async tick(){await worker.tick();await worker.drain();}};
}
async function handoff(f) {
  const session=f.store.get('session',f.command.enrollmentId),run=f.store.get('run',f.plan.run.id);
  await handoffSession(f.store,{schemaVersion:'1.0',id:crypto.randomUUID(),runId:run.id,enrollmentId:session.id,
    expectedRunRevision:run.revision,expectedSessionRevision:session.revision,expectedLastTurnId:session.lastTurnId,
    expectedHumanActivityRevision:session.humanActivityRevision},f.resolver.resolve,context);
}
for(const part of ['module','manifest','schemas'])test(`installed ${part} tampering rejects before module evaluation`,async t=>{
  const path=root(t),pkg=installed(path);pkg.artifact.module='globalThis.__labstrideTampered=true; export function createExtension(){return {}}';
  if(part==='manifest')pkg.artifact.manifest.version='changed';if(part==='schemas')pkg.artifact.schemas.configuration=false;
  writeFileSync(pkg.pin.artifactPath,JSON.stringify(pkg.artifact));
  assert.throws(()=>freezeProfile('run','config',pkg.pin,host),fail('integrity_mismatch'));assert.equal(globalThis.__labstrideTampered,undefined);
});
test('incompatible installed protocol rejects before extension code executes',t=>{
  const path=root(t),pkg=installed(path);pkg.artifact.manifest.protocol.major=2;
  pkg.artifact.module='globalThis.__labstrideProtocol=true;';const bytes=Buffer.from(JSON.stringify(pkg.artifact));
  writeFileSync(pkg.pin.artifactPath,bytes);pkg.pin.integrity=createHash('sha256').update(bytes).digest('hex');
  assert.throws(()=>freezeProfile('run','config',pkg.pin,host));assert.equal(globalThis.__labstrideProtocol,undefined);
});
test('installed bundles cannot resolve external package code',async t=>{
  const path=root(t),pkg=installed(path);pkg.artifact.module='import "node:assert"; import "ajv"; globalThis.__labstrideExternal=true; export function createExtension(){return {}}';
  const bytes=Buffer.from(JSON.stringify(pkg.artifact));writeFileSync(pkg.pin.artifactPath,bytes);pkg.pin.integrity=createHash('sha256').update(bytes).digest('hex');
  const profile=freezeProfile('run','config',pkg.pin,host);await assert.rejects(loadExtension(profile,host),fail('forbidden'));assert.equal(globalThis.__labstrideExternal,undefined);
});
test('invalid local schema, configuration, permission or capability fails before evaluation',t=>{
  const path=root(t);
  for(const change of [p=>p.pin.configuration.extra=true,p=>p.pin.permissions=[],p=>p.pin.capabilities.push('not.installed'),
    p=>{p.artifact.schemas.configuration={$ref:'https://example.invalid/schema'};const b=Buffer.from(JSON.stringify(p.artifact));writeFileSync(p.pin.artifactPath,b);p.pin.integrity=createHash('sha256').update(b).digest('hex');},
    p=>{p.artifact.schemas.configuration={$async:true,type:'object'};const b=Buffer.from(JSON.stringify(p.artifact));writeFileSync(p.pin.artifactPath,b);p.pin.integrity=createHash('sha256').update(b).digest('hex');}]) {
    const pkg=installed(path);change(pkg);assert.throws(()=>freezeProfile('run','config',pkg.pin,host));
  }
});
test('untrusted package-selection input cannot install or redirect the pinned extension',async t=>{
  const f=fixture(t),provider=await f.resolver.resolve(f.profile);
  await assert.rejects(provider.invoke({...f.command.request,input:{package:'untrusted.remote-package',upgrade:true}}));
  assert.deepEqual(f.store.profile(f.plan.run.id,f.pkg.pin.id),f.profile);assert.throws(()=>f.store.binding(f.command.enrollmentId));
});
test('invalid enrollment descriptors are rejected before provider effects',async t=>{
  const f=fixture(t);
  assert.throws(()=>f.store.registerSessionCommand(f.plan.operation.id,{...f.command,enrollmentId:'invalid/id'},context),e=>e.code==='invalid_payload');
  assert.throws(()=>f.store.binding(f.command.enrollmentId));
});
test('installed configuration schemas enforce real date-time formats before evaluation',t=>{
  const path=root(t),pkg=installed(path);pkg.artifact.schemas.configuration.properties.recordedAt={type:'string',format:'date-time'};
  const bytes=Buffer.from(JSON.stringify(pkg.artifact));writeFileSync(pkg.pin.artifactPath,bytes);pkg.pin.integrity=createHash('sha256').update(bytes).digest('hex');
  pkg.pin.configuration.recordedAt='2026-10-23T12:00:00Z';assert.ok(freezeProfile('run','config',pkg.pin,host));
  pkg.pin.configuration.recordedAt='not-a-timestamp';assert.throws(()=>freezeProfile('run','config',pkg.pin,host),e=>e.code==='validation_failed');
});
test('a run keeps its original immutable package/configuration profile across restart',async t=>{
  const f=fixture(t);await f.tick();const old=f.store.profile(f.plan.run.id,f.pkg.pin.id);
  assert.throws(()=>f.store.pinProfile({...old,pin:{...old.pin,configuration:{...old.pin.configuration,backendIdentity:'new'}}},context),fail('identity_conflict'));
  const reboot=startCoordinator(join(f.root,'state'));t.after(()=>reboot.store.close());assert.deepEqual(reboot.store.profile(f.plan.run.id,f.pkg.pin.id),old);
  rmSync(f.pkg.pin.artifactPath);await assert.rejects(loadExtension(old,host),fail('artifact_unavailable'));
});
test('loaded fixture starts once, enrolls, hands off, sends, interrupts, resumes and closes',async t=>{
  const f=fixture(t);await f.tick();await f.tick();assert.equal(f.store.get('operation',f.plan.operation.id).state,'succeeded');
  const session=f.store.get('session',f.command.enrollmentId);assert.equal(session.providerId,f.pkg.pin.id);
  await handoff(f);
  const send=follow(f,'send','send',{schemaVersion:'1.0',sessionGuard:{enrollmentId:session.id,sessionId:session.sessionId,expectedLastTurnId:null,expectedHumanActivityRevision:0}});
  await f.tick();assert.equal(f.store.get('operation',send.operation.id).state,'succeeded');assert.equal(f.store.get('session',session.id).state,'busy');
  for(const command of ['interrupt','resume','observe','close']) { const op=follow(f,command,command);await f.tick();assert.equal(f.store.get('operation',op.operation.id).state,'succeeded'); }
  assert.equal(f.store.binding(session.id).status,'detached');
  const db=new DatabaseSync(f.pkg.pin.configuration.databasePath);t.after(()=>db.close());assert.equal(db.prepare("SELECT count(*) AS n FROM effects WHERE command='start'").get().n,1);
});
test('lost session start reply reconciles the original backend receipt without another start',async t=>{
  const f=fixture(t),real=await f.resolver.resolve(f.profile);
  const lossy={...real,async invoke(request){await real.invoke(request);throw Error('reply lost');}};
  const w=createWorker(f.store,{executorId:'lost',nextAttempt:()=>crypto.randomUUID(),adapters:new Map([[actionKey(sessionAction,sessionActionVersion),createSessionAction(f.store,async()=>lossy)]])});
  await w.tick();await w.drain();assert.equal(f.store.get('operation',f.plan.operation.id).state,'outcome_unknown');
  await f.tick();assert.equal(f.store.get('operation',f.plan.operation.id).state,'succeeded');
  const db=new DatabaseSync(f.pkg.pin.configuration.databasePath);t.after(()=>db.close());assert.equal(db.prepare('SELECT count(*) AS n FROM effects').get().n,1);
});
test('backend atomically rejects human activity after the local send gate',async t=>{
  const f=fixture(t);await f.tick();await handoff(f);const session=f.store.get('session',f.command.enrollmentId);
  const next=follow(f,'race','send',{schemaVersion:'1.0',sessionGuard:{enrollmentId:session.id,sessionId:session.sessionId,expectedLastTurnId:null,expectedHumanActivityRevision:0}});
  const real=await f.resolver.resolve(f.profile),db=new DatabaseSync(f.pkg.pin.configuration.databasePath);t.after(()=>db.close());
  const racing={...real,async invoke(request){const row=db.prepare('SELECT payload FROM sessions WHERE id=?').get(session.sessionId),value=JSON.parse(row.payload);value.humanActivityRevision++;db.prepare('UPDATE sessions SET payload=? WHERE id=?').run(JSON.stringify(value),session.sessionId);return real.invoke(request);}};
  const w=createWorker(f.store,{executorId:'race',nextAttempt:()=>crypto.randomUUID(),adapters:new Map([[actionKey(sessionAction,sessionActionVersion),createSessionAction(f.store,async()=>racing)]])});
  await w.tick();await w.drain();assert.equal(f.store.get('operation',next.operation.id).state,'failed');assert.equal(f.store.savedSessionReply(next.operation.id).code,'stale_revision');
  assert.equal(db.prepare("SELECT count(*) AS n FROM effects WHERE command='send'").get().n,0);
});
test('foreign enrollment or malformed response cannot create another session',async t=>{
  const f=fixture(t);assert.throws(()=>f.store.recordSessionReply(f.plan.operation.id,{outcome:'ok',observation:{}}));
  assert.throws(()=>f.store.binding(f.command.enrollmentId),fail('not_found'));await f.tick();
  const session=f.store.get('session',f.command.enrollmentId);assert.equal(session.sessionId,f.store.binding(session.id).sessionId);
});
for(const stage of ['before-effect','after-effect'])test(`actual coordinator SIGKILL ${stage} preserves original session operation without replay`,async t=>{
  const f=fixture(t),{fork}=await import('node:child_process'),{once}=await import('node:events');
  const child=fork(new URL('./helpers/session-process.mjs',import.meta.url),[join(f.root,'state'),stage],{stdio:['ignore','pipe','pipe','ipc']});
  const exited=once(child,'exit');t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}});
  const [message]=await once(child,'message',{signal:AbortSignal.timeout(10000)});assert.equal(message.stage,stage);child.kill('SIGKILL');await exited;
  const reboot=startCoordinator(join(f.root,'state'));t.after(()=>reboot.store.close());
  const w=createWorker(reboot.store,{executorId:'recovery',nextAttempt:()=>crypto.randomUUID(),adapters:new Map([[actionKey(sessionAction,sessionActionVersion),createSessionAction(reboot.store,f.resolver.resolve)]])});
  await w.tick();await w.drain();
  assert.equal(reboot.store.get('operation',f.plan.operation.id).state,stage==='after-effect'?'succeeded':'outcome_unknown');
  const db=new DatabaseSync(f.pkg.pin.configuration.databasePath);t.after(()=>db.close());assert.equal(db.prepare('SELECT count(*) AS n FROM effects').get().n,stage==='after-effect'?1:0);
  if(stage==='after-effect')assert.equal(reboot.store.binding(f.command.enrollmentId).sessionId,message.sessionId);
});
test('human hold survives late ready observations and ordinary resume; explicit handoff requires fresh revisions',async t=>{
  const f=fixture(t);await f.tick();const session=f.store.get('session',f.command.enrollmentId);
  const db=new DatabaseSync(f.pkg.pin.configuration.databasePath);t.after(()=>db.close());
  const value=JSON.parse(db.prepare('SELECT payload FROM sessions WHERE id=?').get(session.sessionId).payload);value.humanActivityRevision=2;value.lastTurnId='human-turn';
  db.prepare('UPDATE sessions SET payload=? WHERE id=?').run(JSON.stringify(value),session.sessionId);
  const {pinnedSessionObserver}=await import('../packages/core/session-runtime.ts');const observation=await pinnedSessionObserver(f.store,f.resolver.resolve).observe(session);
  f.store.bootObservations();f.store.applySession(f.store.dueSessions()[0],session.revision,observation,1000);
  assert.equal(f.store.controlStatus(f.plan.run.id).humanHold,true);
  const run=f.store.get('run',f.plan.run.id);f.store.resumeRun({schemaVersion:'1.0',id:'resume',runId:run.id,expectedRevision:run.revision,command:'resume'},context);
  assert.equal(f.store.controlStatus(run.id).humanHold,true);await handoff(f);assert.equal(f.store.controlStatus(run.id).humanHold,false);
});
test('an unknown saved observation is re-observed when a backend receipt becomes available',async t=>{
  const f=fixture(t),real=await f.resolver.resolve(f.profile);let reads=0;
  const delayed={...real,async invoke(request){await real.invoke(request);throw Error('lost');},async reconcile(request){reads++;return reads===1?{schemaVersion:'1.0',outcome:'outcome_unknown',evidenceRefs:['fixture:pending-receipt']}:real.reconcile(request);}};
  const w=createWorker(f.store,{executorId:'pending',nextAttempt:()=>crypto.randomUUID(),retry:{maxAttempts:5,baseMs:1,capMs:1},
    adapters:new Map([[actionKey(sessionAction,sessionActionVersion),createSessionAction(f.store,async()=>delayed)]])});
  await w.tick();await w.drain();await w.tick();await w.drain();await new Promise(resolve=>setTimeout(resolve,10));await w.tick();await w.drain();
  assert.equal(reads,2);assert.equal(f.store.get('operation',f.plan.operation.id).state,'succeeded');
});
test('opt-in packaged probe repeats the original start and resumes the same fixture session across processes',async t=>{
  const {execFileSync}=await import('node:child_process'),path=root(t),pkg=installed(path);
  const lockPath=join(path,'lock.json');writeFileSync(lockPath,JSON.stringify({schemaVersion:'1.0',extensions:[pkg.pin]}));
  const source=JSON.parse(readFileSync(new URL('../examples/operation.json',import.meta.url),'utf8')).source;
  const config={schemaVersion:'1.0',probeId:'owned-fixture-probe',createdAt:'2026-10-21T12:00:00Z',dataDir:join(path,'state'),lockFile:lockPath,
    providerId:pkg.pin.id,backendIdentity:'test-backend',actorId:'test-operator',issueId:'owned-test-issue',source,
    workspace:{id:'probe-workspace',targetId:'probe-target',locator:'test:isolated-workspace',branch:'test-branch',ownershipRef:'test:owned'}};
  const configPath=join(path,'probe.json');writeFileSync(configPath,JSON.stringify(config));
  for(const phase of ['start','start','recover','resume','observe']){
    const output=execFileSync(process.execPath,[new URL('../scripts/probe_session.mjs',import.meta.url).pathname,configPath,phase],{encoding:'utf8'});
    assert.equal(JSON.parse(output).runId,'owned-fixture-probe:run');
  }
  const db=new DatabaseSync(pkg.pin.configuration.databasePath);t.after(()=>db.close());assert.equal(db.prepare("SELECT count(*) AS n FROM effects WHERE command='start'").get().n,1);
});
