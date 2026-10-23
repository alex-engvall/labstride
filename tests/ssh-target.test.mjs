import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fork, execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { TargetRegistry, locatorFor } from '../packages/target-helper/registry.ts';
import { rootIdentity, withRoot } from '../packages/target-helper/filesystem.ts';
import { requestDigest } from '../packages/storage-sqlite/execution.ts';
import { createTargetReservationAction, targetResolver, configuredTargetAction } from '../packages/connector-ssh/runtime.ts';
import { freezeProfile } from '../packages/extensions/loader.ts';
import { connectorContracts } from '../packages/connector-ssh/contracts.ts';
import { createWorker, actionKey } from '../packages/core/worker.ts';
import { startCoordinator } from '../apps/coordinator/main.ts';
import { seed, startPlan, eventInput, context } from './helpers/execution-fixture.mjs';
import { validate } from '../tools/conformance/schema.mjs';
import { targetFixture, enrollFixture, installedConnector, host } from './helpers/ssh-fixture.mjs';
import { digest } from '../packages/configuration/json.ts';
const code=expected=>error=>error.code===expected||error.message===expected;
const inspect=request=>({...request,method:'inspect'});
const count=policy=>{const db=new DatabaseSync(join(policy.stateDir,'target.sqlite'),{readOnly:true});try{return db.prepare('SELECT count(*) AS n FROM reservations').get().n;}finally{db.close();}};

test('target reservation is durable, idempotent and never claims a created checkout',t=>{
  const f=targetFixture(t),registry=new TargetRegistry(f.policy);t.after(()=>registry.close());
  const reply=registry.handle(f.request);assert.equal(reply.outcome,'ok');assert.equal(reply.reservation.state,'reserved');
  assert.equal(existsSync(join(f.policy.roots[0].path,reply.reservation.locator)),false);
  assert.deepEqual(registry.handle(f.request),reply);assert.deepEqual(registry.handle(inspect(f.request)),{...reply,method:'inspect'});assert.equal(count(f.policy),1);
});
test('unknown receipt remains unknown across restart and inspect cannot reserve',t=>{
  const f=targetFixture(t);let registry=new TargetRegistry(f.policy);assert.equal(registry.handle(inspect(f.request)).outcome,'outcome_unknown');registry.close();
  registry=new TargetRegistry(f.policy);t.after(()=>registry.close());assert.equal(registry.handle(inspect(f.request)).error.retryClass,'reconcile');assert.equal(count(f.policy),0);
});
test('same operation with different contents and another operation for the workspace are rejected',t=>{
  const f=targetFixture(t),registry=new TargetRegistry(f.policy);t.after(()=>registry.close());registry.handle(f.request);
  const other=structuredClone(f.request);other.operation.runId+='-foreign';other.operation.requestDigest=requestDigest(other.operation);
  assert.equal(registry.handle(other).error.code,'identity_mismatch');
  other.operation.operationId+='-another';other.requestId=other.operation.operationId;other.operation.requestDigest=requestDigest(other.operation);
  assert.equal(registry.handle(other).error.code,'resource_busy');assert.equal(count(f.policy),1);
});
for(const field of ['installationId','targetId','targetRevision'])test(`foreign ${field} cannot cross helper boundary`,t=>{
  const f=targetFixture(t),registry=new TargetRegistry(f.policy);t.after(()=>registry.close());
  const req=structuredClone(f.request);req[field]=field==='targetRevision'?2:'foreign';
  assert.equal(registry.handle(req).error.code,'identity_mismatch');assert.equal(count(f.policy),0);
});
for(const text of ['$(touch injected)','; touch injected','../foreign','/etc/passwd','--proxy-command=touch','https://untrusted.test/extension.mjs'])test(`AC06 hostile root is inert: ${text}`,t=>{
  const f=targetFixture(t),registry=new TargetRegistry(f.policy);t.after(()=>registry.close());
  f.request.operation.inputs.rootId=text;f.request.operation.requestDigest=requestDigest(f.request.operation);
  assert.equal(registry.handle(f.request).error.code,'forbidden');assert.equal(count(f.policy),0);
});
test('issue text is never interpreted, unknown inputs and forged workflow identity fail before effects',t=>{
  const f=targetFixture(t),registry=new TargetRegistry(f.policy);t.after(()=>registry.close());
  for(const field of ['command','path','extensionUrl','approval','completion','executor']){
    const req=structuredClone(f.request);req.operation.inputs[field]='$(touch injected)';req.operation.requestDigest=requestDigest(req.operation);
    assert.equal(registry.handle(req).error.code,'validation_failed');
  }
  for(const method of ['delete','upload','download','cancel','approve','complete'])assert.throws(()=>registry.handle({...f.request,method}));
  assert.equal(count(f.policy),0);
});
test('pre-existing unmanaged path and symlink are never adopted',t=>{
  for(const symlink of [false,true]){
    const f=targetFixture(t),registry=new TargetRegistry(f.policy);t.after(()=>registry.close());
    const locator=locatorFor(f.policy.installationId,f.policy.targetId,f.operation.workspaceId),path=join(f.policy.roots[0].path,locator);
    if(symlink)symlinkSync('/etc',path);else mkdirSync(path);
    assert.equal(registry.handle(f.request).error.code,'resource_busy');assert.equal(count(f.policy),0);assert.ok(existsSync(path));
  }
});
test('AC19 boundary refuses root replacement, symlink, wrong owner and changed mount identity',t=>{
  const f=targetFixture(t),root=f.policy.roots[0];
  for(const key of ['device','inode','mountId','uid'])assert.throws(()=>withRoot(root.path,{...root.identity,[key]:root.identity[key]+1},()=>{}));
  renameSync(root.path,root.path+'-old');mkdirSync(root.path,{mode:0o700});
  assert.throws(()=>new TargetRegistry(f.policy));
  renameSync(root.path,root.path+'-new');symlinkSync(root.path+'-old',root.path);assert.throws(()=>rootIdentity(root.path));
});
test('root changed at the commit barrier rolls back the reservation and preserves both directories',t=>{
  const f=targetFixture(t),root=f.policy.roots[0];
  const registry=new TargetRegistry(f.policy,stage=>{if(stage==='before-commit'){renameSync(root.path,root.path+'-old');mkdirSync(root.path,{mode:0o700});}});
  t.after(()=>registry.close());assert.equal(registry.handle(f.request).outcome,'error');assert.equal(count(f.policy),0);assert.ok(existsSync(root.path+'-old'));
});
test('registry, policy and secret paths cannot be redirected through writable parents or links',t=>{
  const f=targetFixture(t);chmodSync(f.policy.stateDir,0o777);assert.throws(()=>new TargetRegistry(f.policy));
  chmodSync(f.policy.stateDir,0o700);symlinkSync(join(f.root,'foreign.sqlite'),join(f.policy.stateDir,'target.sqlite'));assert.throws(()=>new TargetRegistry(f.policy));
});
test('helper validates malformed and oversized stdin before opening its registry',async t=>{
  const f=targetFixture(t);
  const foreign=structuredClone(f.request);foreign.installationId='foreign';
  const injection=structuredClone(f.request);injection.operation.inputs.rootId='$(touch injected)';injection.operation.requestDigest=requestDigest(injection.operation);
  for(const payload of ['{','{}','x'.repeat(262145),JSON.stringify(foreign),JSON.stringify(injection)]){
    const p=spawn(process.execPath,['apps/target-helper/main.ts',f.policyFile],{stdio:['pipe','pipe','pipe']});
    let out='',err='';p.stdout.on('data',c=>out+=c);p.stderr.on('data',c=>err+=c);p.stdin.on('error',()=>{});p.stdin.end(payload);
    const [exit]=await once(p,'exit');assert.equal(exit,1);assert.equal(out,'');assert.equal(err,'validation_failed\n');assert.equal(existsSync(join(f.policy.stateDir,'target.sqlite')),false);
  }
});
test('enrollment is explicit, audited, compare-and-set and immutable for old pinned profiles',async t=>{
  const f=targetFixture(t),e=enrollFixture(f);t.after(()=>e.store.close());const {connector}=await installedConnector(f,e.configuration);
  await connector.validate(f.request);
  assert.throws(()=>e.store.publish({...e.enrollment,revision:2},0,{actorId:'operator',reason:'stale revision'}));
  const config2=e.store.publish({...e.enrollment,revision:2},1,{actorId:'operator',reason:'Explicit host key rotation'});
  assert.equal(config2.revision,2);assert.equal(e.store.history(f.policy.targetId).length,2);
  await assert.rejects(connector.validate(f.request),code('identity_mismatch'));
});
for(const bad of [{host:'-oProxyCommand=touch'},{host:'host;touch'},{host:'$(touch)'},{user:'root;touch'},{helperCommand:'/bin/sh -c touch'},{identityFile:'/tmp/../secret'}])test(`AC06 enrollment rejects unsafe operator fields: ${Object.keys(bad)[0]} ${Object.values(bad)[0]}`,t=>{
  const f=targetFixture(t),e=enrollFixture(f);t.after(()=>e.store.close());
  assert.throws(()=>e.store.publish({...e.enrollment,...bad,revision:2},1,{actorId:'operator',reason:'invalid'}));assert.equal(e.store.history(f.policy.targetId).length,1);
});
for(const stage of ['before-commit','after-commit'])test(`SIGKILL helper ${stage} preserves a single original reservation or unknown`,async t=>{
  const f=targetFixture(t),requestFile=join(f.root,'request.json');writeFileSync(requestFile,JSON.stringify(f.request),{mode:0o600});
  const p=fork(new URL('./helpers/target-process.mjs',import.meta.url),[f.policyFile,requestFile,stage],{stdio:['ignore','pipe','pipe','ipc']});
  const exited=once(p,'exit');t.after(async()=>{if(p.exitCode===null&&p.signalCode===null){p.kill('SIGKILL');await exited;}});
  const message=async()=>(await once(p,'message',{signal:AbortSignal.timeout(10000)}))[0];assert.equal((await message()).stage,'ready');
  const barrier=message();p.send('go');assert.equal((await barrier).stage,stage);p.kill('SIGKILL');await exited;
  const registry=new TargetRegistry(f.policy);t.after(()=>registry.close());const result=registry.handle(inspect(f.request));
  assert.equal(result.outcome,stage==='before-commit'?'outcome_unknown':'ok');assert.equal(count(f.policy),stage==='before-commit'?0:1);
});
test('durable worker reconciles a lost helper reply without invoking reserve again',async t=>{
  const f=targetFixture(t),registry=new TargetRegistry(f.policy);t.after(()=>registry.close());
  const state=join(f.root,'coordinator'),runtime=startCoordinator(state);seed(runtime.store);
  const plan=startPlan();plan.operation.request=f.operation;plan.workspace.targetId=f.operation.targetId;
  runtime.store.scheduleStart(runtime.store.receive(eventInput()).id,plan,context);
  let reserves=0,inspections=0;
  const action=createTargetReservationAction(async()=>({installationId:f.policy.installationId,revision:1,connector:{
    validate(){},async invoke(req){if(req.method==='reserve'){reserves++;registry.handle(req);throw Error('lost reply');}inspections++;return registry.handle(req);}}}));
  const options={executorId:'ssh-test',nextAttempt:()=> 'attempt',adapters:new Map([[actionKey(f.operation.actionId,f.operation.actionVersion),action]])};
  let worker=createWorker(runtime.store,options);await worker.tick();await worker.drain();assert.equal(runtime.store.get('operation',f.operation.operationId).state,'outcome_unknown');runtime.store.close();
  const reboot=startCoordinator(state);t.after(()=>reboot.store.close());worker=createWorker(reboot.store,options);await worker.tick();await worker.drain();
  assert.equal(reboot.store.get('operation',f.operation.operationId).state,'succeeded');assert.equal(reserves,1);assert.equal(inspections,1);assert.equal(count(f.policy),1);
  assert.equal(reboot.store.get('workspace',f.operation.workspaceId).state,'requested');
});
test('result contracts reject forged workflow identity and approval authority',t=>{
  const f=targetFixture(t),registry=new TargetRegistry(f.policy);t.after(()=>registry.close());const reply=registry.handle(f.request);
  for(const key of ['executor','approved','completed','policy','ownership'])assert.throws(()=>validate('ssh-helper-response',{...reply,[key]:true}));
});
test('a probe-only installed profile cannot invoke reservation or inspection',async t=>{
  const f=targetFixture(t),e=enrollFixture(f);t.after(()=>e.store.close());const installed=await installedConnector(f,e.configuration);
  const profile=freezeProfile(f.operation.runId,f.operation.configDigest,{...installed.pin,capabilities:['target.probe.v1']},host);
  const connector=await targetResolver(host).resolve(profile);
  await assert.rejects(connector.validate(f.request),code('unsupported_capability'));
  await assert.rejects(connector.validate(inspect(f.request)),code('unsupported_capability'));
  assert.equal(existsSync(join(f.policy.stateDir,'target.sqlite')),false);
});
test('registry cannot reside inside an enrolled source root and existing unmanaged databases survive',t=>{
  const f=targetFixture(t);assert.throws(()=>new TargetRegistry({...f.policy,stateDir:f.policy.roots[0].path}));
  const path=join(f.policy.stateDir,'target.sqlite'),db=new DatabaseSync(path);db.exec('CREATE TABLE unmanaged (value TEXT); INSERT INTO unmanaged VALUES (\'preserved\')');db.close();chmodSync(path,0o600);
  assert.throws(()=>new TargetRegistry(f.policy));const check=new DatabaseSync(path,{readOnly:true});
  try{assert.equal(check.prepare('SELECT value FROM unmanaged').get().value,'preserved');}finally{check.close();}
});
test('expired requests cannot reserve, while committed reservation receipts remain readable',t=>{
  const f=targetFixture(t),registry=new TargetRegistry(f.policy);t.after(()=>registry.close());registry.handle(f.request);
  const expired=structuredClone(f.request);expired.operation.deadline='2020-01-01T00:00:00Z';expired.operation.operationId+='-expired';expired.requestId=expired.operation.operationId;expired.operation.requestDigest=requestDigest(expired.operation);
  assert.equal(registry.handle(expired).error.code,'forbidden');assert.equal(registry.handle(inspect(f.request)).outcome,'ok');assert.equal(count(f.policy),1);
});
test('public connector contracts correlate probe/execute/inspect and refuse unsupported capabilities',async t=>{
  const f=targetFixture(t),registry=new TargetRegistry(f.policy);t.after(()=>registry.close());
  const call=connectorContracts({connector:{validate(){},async invoke(req){return registry.handle(req);}},installationId:f.policy.installationId,targetId:f.policy.targetId,revision:1,operation:()=>f.operation});
  const base={schemaVersion:'1.0',requestId:'contract-request',extensionId:'labstride.connector.ssh',protocol:{major:1,minor:0},family:'connector'};
  const probe=await call({...base,method:'probe',input:{targetId:f.policy.targetId}});assert.equal(probe.outcome,'ok');assert.equal(probe.requestId,base.requestId);
  const execute=await call({...base,method:'execute',input:{operation:f.operation}});assert.equal(execute.outcome,'ok');assert.equal(execute.result.outputs.reservation.state,'reserved');assert.equal('executor' in execute.result,false);
  const inspect=await call({...base,method:'inspect',input:{handle:f.operation.operationId}});assert.deepEqual(inspect.result,execute.result);
  const cancel=await call({...base,method:'cancel',input:{handle:f.operation.operationId}});assert.equal(cancel.error.code,'unsupported_capability');assert.equal(count(f.policy),1);
});
test('configured target action uses the original run snapshot and blocks changed enrollment before effects',async t=>{
  const f=targetFixture(t),e=enrollFixture(f);t.after(()=>e.store.close());const installed=await installedConnector(f,e.configuration);
  // A structural snapshot stands in for the already tested trusted store port;
  // this fixture neither activates configuration nor grants a run authorization.
  const snapshot=JSON.parse(readFileSync(new URL('../examples/configuration-snapshot.json',import.meta.url),'utf8'));
  snapshot.configuration.installationId=f.policy.installationId;
  snapshot.configuration.targets={[f.policy.targetId]:{connector:installed.pin.id,configuration:e.configuration}};
  snapshot.extensionLock.extensions=[installed.pin];delete snapshot.digest;snapshot.digest=digest(snapshot);
  const operation=structuredClone(f.operation);operation.configDigest=snapshot.digest;operation.requestDigest=requestDigest(operation);
  const adapter=configuredTargetAction({runConfiguration:()=>snapshot},host);await adapter.validate(operation);
  await assert.rejects(configuredTargetAction({runConfiguration:()=>null},host).validate(operation),code('configuration_invalid'));
  await assert.rejects(adapter.validate({...operation,configDigest:'f'.repeat(64)}),code('identity_mismatch'));
  e.store.publish({...e.enrollment,revision:2},1,{actorId:'operator',reason:'Explicit rotation while original run is retained'});
  await assert.rejects(adapter.validate(operation),code('identity_mismatch'));assert.equal(existsSync(join(f.policy.stateDir,'target.sqlite')),false);
});
test('a post-commit helper failure remains uncertain and the original receipt can be inspected',t=>{
  const f=targetFixture(t),registry=new TargetRegistry(f.policy,stage=>{if(stage==='after-commit')throw Error('Lost durability acknowledgement');});t.after(()=>registry.close());
  assert.equal(registry.handle(f.request).outcome,'outcome_unknown');assert.equal(count(f.policy),1);
  assert.equal(registry.handle(inspect(f.request)).outcome,'ok');assert.equal(count(f.policy),1);
});
test('a denied inspection cannot turn an unresolved original operation into a failed effect',async t=>{
  const f=targetFixture(t),registry=new TargetRegistry(f.policy);t.after(()=>registry.close());
  const action=createTargetReservationAction(async()=>({installationId:f.policy.installationId,revision:1,connector:{validate(){},async invoke(req){
    return {...registry.handle({...req,targetRevision:2}),targetRevision:1};
  }}}));
  await assert.rejects(action.reconcile(f.operation,null),code('outcome_unknown'));assert.equal(count(f.policy),0);
});
