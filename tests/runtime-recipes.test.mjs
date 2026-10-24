import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, readdirSync, renameSync, symlinkSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { runtimeFixture } from './helpers/runtime-fixture.mjs';
import { requestDigest, digest } from '../packages/storage-sqlite/execution.ts';
import { runtimeNamespace } from '../packages/target-helper/runtime-contracts.ts';
import { RuntimeRegistry } from '../packages/target-helper/runtimes.ts';
const sql=(path,query)=>{const db=new DatabaseSync(path,{readOnly:true});try{return db.prepare(query).all();}finally{db.close();}};
function owned(t,f,barrier){const r=f.open(barrier);t.after(()=>r.close());return r;}
test('LS-SSH-005 source-only checkout needs no runtime installation or agent and creates no app resources',async t=>{
  const f=await runtimeFixture(t);
  assert.equal(f.created.state,'ready');assert.deepEqual(readdirSync(join(f.root,'services')),[]);
  assert.equal(existsSync(join(f.root,'runtime-state','runtimes.sqlite')),false);
});
test('two public recipes create actual SQLite and HTTP resources in independent workspace namespaces',async t=>{
  const f=await runtimeFixture(t),r=owned(t,f);
  const database=await r.handle(f.requestFor(0)),http=await r.handle(f.requestFor(1));
  assert.equal(database.outcome,'ok',JSON.stringify(database));assert.equal(http.outcome,'ok',JSON.stringify(http));
  assert.notEqual(database.runtime.namespace,http.runtime.namespace);
  assert.equal(sql(database.runtime.resources[0].locator,'SELECT * FROM labstride_owner')[0].binding_digest,database.runtime.bindingDigest);
  const response=await fetch(http.runtime.resources[0].locator);assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{namespace:http.runtime.namespace,bindingDigest:http.runtime.bindingDigest});
  assert.equal(database.runtime.cleanup.trigger,'workspace.completed');assert.equal(http.runtime.cleanup.trigger,'operator.request');
  const other={...f.request,requestId:'operation-source-two',operation:structuredClone(f.operation)};
  Object.assign(other.operation,{operationId:other.requestId,runId:'run-two',workspaceId:'workspace-two'});other.operation.requestDigest=requestDigest(other.operation);
  const {WorkspaceRegistry}=await import('../packages/target-helper/workspaces.ts'),sources=new WorkspaceRegistry(f.policy,f.dependencies);
  const source=await sources.handle(other);sources.close();assert.equal(source.outcome,'ok');
  const second=f.requestFor(0,{operationId:'operation-runtime-two',runId:'run-two',workspaceId:'workspace-two'});
  second.operation.inputs.workspaceOperationId=other.requestId;second.operation.requestDigest=requestDigest(second.operation);
  const result=await r.handle(second);assert.equal(result.outcome,'ok',JSON.stringify(result));assert.notEqual(result.runtime.namespace,database.runtime.namespace);
  assert.notEqual(result.runtime.resources[0].locator,database.runtime.resources[0].locator);
  const secondHttp=f.requestFor(1,{operationId:'operation-http-two',runId:'run-two',workspaceId:'workspace-two'});
  secondHttp.operation.inputs.workspaceOperationId=other.requestId;secondHttp.operation.requestDigest=requestDigest(secondHttp.operation);
  const service=await r.handle(secondHttp);assert.equal(service.outcome,'ok',JSON.stringify(service));
  assert.notEqual(new URL(service.runtime.resources[0].locator).port,new URL(http.runtime.resources[0].locator).port);
  assert.equal((await (await fetch(service.runtime.resources[0].locator)).json()).namespace,service.runtime.namespace);
  assert.equal(sql(join(f.root,'runtime-state','runtimes.sqlite'),'SELECT * FROM runtimes').length,4);
});
test('duplicate and concurrent creates retain original handle, resource, receipt and user changes',async t=>{
  const f=await runtimeFixture(t),r=owned(t,f),req=f.requestFor();
  const results=await Promise.all([r.handle(req),r.handle(req)]),original=results.find(x=>x.outcome==='ok');assert.ok(original,JSON.stringify(results));
  const db=new DatabaseSync(original.runtime.resources[0].locator);db.exec('CREATE TABLE human_work (value TEXT); INSERT INTO human_work VALUES (\'keep me\');');db.close();
  writeFileSync(join(f.sourcePath(f.created),'hello.txt'),'human source edit');
  assert.deepEqual((await r.handle(req)).runtime,original.runtime);
  assert.deepEqual((await r.handle({...req,method:'inspect'})).runtime,original.runtime);
  assert.equal(sql(original.runtime.resources[0].locator,'SELECT * FROM human_work')[0].value,'keep me');
  assert.equal(readFileSync(join(f.sourcePath(f.created),'hello.txt'),'utf8'),'human source edit');
  assert.equal(sql(join(f.root,'runtime-state','runtimes.sqlite'),'SELECT * FROM runtimes').length,1);
  assert.equal(readdirSync(join(f.root,'services')).length,1);
});
for(const stage of ['intent','driver-returned','committed'])test(`interruption at ${stage} never replays create; only complete evidence recovers`,async t=>{
  const f=await runtimeFixture(t),r=f.open(at=>{if(at===stage)throw Error('lost process');});
  const lost=await r.handle(f.requestFor());r.close();assert.equal(lost.outcome,'outcome_unknown');
  const reboot=owned(t,f),reply=await reboot.handle({...f.requestFor(),method:'inspect'});
  assert.equal(reply.outcome,stage==='intent'?'outcome_unknown':'ok',JSON.stringify(reply));
  const duplicate=await reboot.handle(f.requestFor());assert.equal(duplicate.outcome,reply.outcome);
  assert.equal(readdirSync(join(f.root,'services')).length,stage==='intent'?0:1);
});
for(const stage of ['intent','driver-returned','committed'])test(`actual SIGKILL at runtime ${stage} retains the original operation`,async t=>{
  const f=await runtimeFixture(t),spec=join(f.root,'process.json');writeFileSync(spec,JSON.stringify({installation:f.installation,request:f.requestFor(),stage}));
  const child=fork(new URL('./helpers/runtime-process.mjs',import.meta.url),[spec],{stdio:['ignore','pipe','pipe','ipc']});
  const exited=once(child,'exit');t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}});
  const message=(await once(child,'message',{signal:AbortSignal.timeout(10000)}))[0];assert.equal(message.stage,stage);child.kill('SIGKILL');await exited;
  const reboot=owned(t,f),reply=await reboot.handle({...f.requestFor(),method:'inspect'});assert.equal(reply.outcome,stage==='intent'?'outcome_unknown':'ok');
  assert.equal(sql(join(f.root,'runtime-state','runtimes.sqlite'),'SELECT * FROM runtimes').length,1);
});
test('wrong recipe, digest, source ownership, injected paths and expired creates cause no runtime effects',async t=>{
  const f=await runtimeFixture(t),r=owned(t,f);
  for(const mutate of [op=>op.inputs.recipe.digest='f'.repeat(64),op=>op.inputs.recipe.id='unknown',op=>op.inputs.command='touch /tmp/foreign',
    op=>op.inputs.workspaceOperationId='unknown',op=>op.source.sha='a'.repeat(40),op=>op.workspaceId='foreign',op=>op.inputs.rootId='../../foreign',op=>op.deadline='2000-01-01T00:00:00Z']) {
    const request=f.requestFor();mutate(request.operation);request.operation.requestDigest=requestDigest(request.operation);
    const reply=await r.handle(request);assert.notEqual(reply.outcome,'ok');
  }
  assert.equal(sql(join(f.root,'runtime-state','runtimes.sqlite'),'SELECT * FROM runtimes').length,0);assert.deepEqual(readdirSync(join(f.root,'services')),[]);
});
test('another operation cannot allocate the same workspace recipe; changed digest cannot adopt original resources',async t=>{
  const f=await runtimeFixture(t),r=owned(t,f);assert.equal((await r.handle(f.requestFor())).outcome,'ok');
  assert.equal((await r.handle(f.requestFor(0,{operationId:'another-operation'}))).error.code,'resource_busy');
  const req=f.requestFor();req.operation.deadline='2099-01-01T00:00:00Z';req.operation.requestDigest=requestDigest(req.operation);
  assert.equal((await r.handle(req)).error.code,'identity_mismatch');
});
test('foreign directories and symlinks are preserved and never adopted by the driver',async t=>{
  const f=await runtimeFixture(t),req=f.requestFor(),ns=runtimeNamespace(f.policy.installationId,f.policy.targetId,f.operation.workspaceId,req.operation.inputs.recipe);
  const foreign=join(f.root,'foreign');mkdirSync(foreign);writeFileSync(join(foreign,'keep'),'valuable');symlinkSync(foreign,join(f.root,'services',ns));
  const r=owned(t,f);assert.equal((await r.handle(req)).outcome,'outcome_unknown');
  assert.equal((await r.handle({...req,method:'inspect'})).outcome,'outcome_unknown');assert.equal(readFileSync(join(foreign,'keep'),'utf8'),'valuable');
});
test('unsafe or changed driver bytes are rejected before effects, and configuration drift cannot recover under a new recipe',async t=>{
  const f=await runtimeFixture(t);chmodSync(f.recipes[0].driver.path,0o666);assert.throws(()=>f.open(),e=>e.code==='forbidden');chmodSync(f.recipes[0].driver.path,0o600);
  const r=f.open();assert.equal((await r.handle(f.requestFor())).outcome,'ok');r.close();
  writeFileSync(f.recipes[0].driver.path,'throw Error("changed")');assert.throws(()=>f.open(),e=>e.code==='identity_mismatch');
});
test('changed source root identity blocks runtime attachment and preserves original resources',async t=>{
  const f=await runtimeFixture(t),r=owned(t,f);assert.equal((await r.handle(f.requestFor())).outcome,'ok');
  const root=f.policy.roots[0].path;renameSync(root,root+'-retained');mkdirSync(root);
  assert.equal((await r.handle({...f.requestFor(),method:'inspect'})).outcome,'outcome_unknown');
  assert.equal(readdirSync(join(f.root,'services')).length,1);
});
for(const fault of ['binding','name','url','malformed','oversized','timeout'])test(`driver ${fault} cannot become success or authorize a repeated create`,async t=>{
  const f=await runtimeFixture(t),driver=f.recipes[0].driver;
  const source=`let text='';for await(const c of process.stdin)text+=c;const r=JSON.parse(text);${fault==='timeout'?"setInterval(()=>{},1000);await new Promise(()=>{});":fault==='malformed'?"process.stdout.write('invalid');":fault==='oversized'?"process.stdout.write('x'.repeat(65537));":`process.stdout.write(JSON.stringify({schemaVersion:'1.0',status:'ready',bindingDigest:${fault==='binding'?"'f'.repeat(64)":"r.bindingDigest"},resources:[{...r.binding.resources[0],name:${fault==='name'?"'rt-'+ 'a'.repeat(40)+'-db'":"r.binding.resources[0].name"},locator:${fault==='url'?"'https://username:password@example.test/'":"'opaque:example'"},state:'ready'}],evidenceRefs:['test:actual-driver']}));`}`;
  if(fault==='url')f.recipes[0].resources[0].type='url';
  if(fault==='timeout')f.recipes[0].timeoutMs=150;
  writeFileSync(driver.path,source);driver.integrity=(await import('node:crypto')).createHash('sha256').update(source).digest('hex');
  const r=owned(t,f),req=f.requestFor();assert.equal((await r.handle(req)).outcome,'outcome_unknown');
  const rows=sql(join(f.root,'runtime-state','runtimes.sqlite'),'SELECT receipt FROM runtimes');assert.equal(rows.length,1);assert.equal(rows[0].receipt,null);
});
test('v3 installation serves original v1/v2 requests with their original capabilities',async t=>{
  const f=await runtimeFixture(t),{serve}=await import('../apps/target-helper/main.ts');
  const invoke=async request=>{let response;await serve(f.runtimePolicyFile,(async function*(){yield Buffer.from(JSON.stringify(request));})(),text=>response=JSON.parse(text));return response;};
  const legacy=await invoke({schemaVersion:'1.0',requestId:'legacy-probe',installationId:f.policy.installationId,targetId:f.policy.targetId,targetRevision:1,method:'probe'});
  assert.equal(legacy.schemaVersion,'1.0');assert.deepEqual(legacy.capabilities,['target.probe.v1','target.reserve.v1','target.inspect.v1']);
  const source=await invoke({...f.request,method:'inspect'});assert.equal(source.schemaVersion,'2.0');assert.deepEqual(source.workspace,f.created);
  assert.deepEqual(source.capabilities,['workspace.probe.v1','workspace.create.v1','workspace.inspect.v1']);
});
test('runtime namespace canonicalizes recipe pin keys and is independent of the operation ID',()=>{
  const a={id:'recipe',version:'1.0.0',digest:'a'.repeat(64)},b={digest:a.digest,version:a.version,id:a.id};
  assert.equal(runtimeNamespace('installation','target','workspace',a),runtimeNamespace('installation','target','workspace',b));
  assert.notEqual(runtimeNamespace('installation','target','workspace',a),runtimeNamespace('installation','target','other',a));
});
test('an unmanaged registry or changed installation identity is preserved and refused',async t=>{
  const f=await runtimeFixture(t),path=join(f.root,'runtime-state','runtimes.sqlite');
  const db=new DatabaseSync(path);db.exec('CREATE TABLE valuable (value TEXT); PRAGMA user_version=1;');db.close();chmodSync(path,0o600);
  assert.throws(()=>f.open(),e=>e.code==='configuration_invalid');assert.equal(sql(path,'SELECT name FROM sqlite_master WHERE type=\'table\'')[0].name,'valuable');
});
test('actual helper SIGKILL after HTTP creation recovers the original live process and allocated port',async t=>{
  const f=await runtimeFixture(t),request=f.requestFor(1),spec=join(f.root,'http-crash.json');
  writeFileSync(spec,JSON.stringify({installation:f.installation,request,stage:'driver-returned'}));
  const child=fork(new URL('./helpers/runtime-process.mjs',import.meta.url),[spec],{stdio:['ignore','pipe','pipe','ipc']}),exited=once(child,'exit');
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}});
  await once(child,'message',{signal:AbortSignal.timeout(10000)});child.kill('SIGKILL');await exited;
  const ns=runtimeNamespace(f.policy.installationId,f.policy.targetId,f.operation.workspaceId,request.operation.inputs.recipe),ready=JSON.parse(readFileSync(join(f.root,'services',ns,'ready.json'),'utf8'));
  const r=owned(t,f),reply=await r.handle({...request,method:'inspect'});assert.equal(reply.outcome,'ok',JSON.stringify(reply));
  assert.equal(reply.runtime.resources[0].locator,ready.resource.locator);assert.equal((await(await fetch(ready.resource.locator)).json()).bindingDigest,reply.runtime.bindingDigest);
  assert.equal(JSON.parse(readFileSync(join(f.root,'services',ns,'ready.json'),'utf8')).pid,ready.pid);
});
test('a dead HTTP runtime with no committed helper receipt remains unknown and is never restarted',async t=>{
  const f=await runtimeFixture(t),r=owned(t,f,stage=>{if(stage==='driver-returned')throw Error('reply lost');}),request=f.requestFor(1);
  assert.equal((await r.handle(request)).outcome,'outcome_unknown');
  const ns=runtimeNamespace(f.policy.installationId,f.policy.targetId,f.operation.workspaceId,request.operation.inputs.recipe),readyPath=join(f.root,'services',ns,'ready.json'),ready=JSON.parse(readFileSync(readyPath,'utf8'));
  assert.ok(readFileSync(`/proc/${ready.pid}/cmdline`,'utf8').includes(join(f.root,'driver.mjs')));assert.equal(readFileSync(`/proc/${ready.pid}/stat`,'utf8').split(' ')[21],ready.processStart);process.kill(ready.pid,'SIGTERM');
  const reply=await r.handle({...request,method:'inspect'});assert.equal(reply.outcome,'outcome_unknown');
  assert.equal((await r.handle(request)).outcome,'outcome_unknown');assert.equal(JSON.parse(readFileSync(readyPath,'utf8')).pid,ready.pid);
  assert.equal(sql(join(f.root,'runtime-state','runtimes.sqlite'),'SELECT receipt FROM runtimes')[0].receipt,null);
});
