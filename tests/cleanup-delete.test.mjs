import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { deletionFixture } from './helpers/cleanup-delete-fixture.mjs';
import { requestDigest } from '../packages/storage-sqlite/execution.ts';
import { assertNoWriters } from '../packages/target-helper/cleanup-filesystem.ts';
import { WorkspaceRegistry } from '../packages/target-helper/workspaces.ts';
import { validated } from '../packages/storage-sqlite/validation.ts';

test('LS-CLN-004/005 removes exactly the owned directory and returns the original protected tombstone',async t=>{
 const f=await deletionFixture(t),sibling=join(f.root,'unrelated');mkdirSync(sibling);writeFileSync(join(sibling,'keep'),'survive');
 const prepared=f.call();assert.equal(prepared.state,'prepared',JSON.stringify(prepared));assert.equal(lstatSync(f.path).mode&0o777,0o700);
 const result=f.call(f.commit(prepared.preparation));assert.equal(result.state,'deleted',JSON.stringify(result));assert.equal(existsSync(f.path),false);
 mkdirSync(f.path);writeFileSync(join(f.path,'foreign'),'replacement');
 assert.deepEqual(f.call().tombstone,result.tombstone);assert.deepEqual(f.call({...f.request,method:'inspect'}).tombstone,result.tombstone);
 assert.equal(readFileSync(join(f.path,'foreign'),'utf8'),'replacement');assert.equal(readFileSync(join(sibling,'keep'),'utf8'),'survive');
 const db=new DatabaseSync(join(f.policy.stateDir,'target.sqlite'));t.after(()=>db.close());
 assert.throws(()=>db.exec('DELETE FROM cleanup_deletions'),/immutable/);assert.throws(()=>db.exec("UPDATE cleanup_deletions SET tombstone=NULL"),/immutable/);
});
for(const kind of ['symlink','foreign','source-symlink','root','parent'])test(`AC19 ${kind} substitution refuses removal`,async t=>{
 const f=await deletionFixture(t),foreign=join(f.root,'foreign');mkdirSync(foreign);writeFileSync(join(foreign,'keep'),'survive');
 if(kind==='symlink'||kind==='foreign'){renameSync(f.path,f.path+'.saved');if(kind==='symlink')symlinkSync(foreign,f.path);else mkdirSync(f.path);}
 if(kind==='source-symlink'){renameSync(join(f.path,'source'),join(f.path,'source.saved'));symlinkSync(foreign,join(f.path,'source'));}
 if(kind==='root'){const root=f.policy.roots[0].path;renameSync(root,root+'.saved');mkdirSync(root,{mode:0o700});}
 if(kind==='parent'){chmodSync(f.root,0o777);}
 if(['root','parent'].includes(kind))assert.throws(()=>f.call());else assert.notEqual(f.call().state,'deleted');if(kind==='parent')chmodSync(f.root,0o700);assert.equal(readFileSync(join(foreign,'keep'),'utf8'),'survive');
});
for(const kind of ['wrapper-extra','hardlink','dirty','untracked','ignored','active-writer','visibility'])test(`cleanup retains ${kind} before the move`,async t=>{
 const f=await deletionFixture(t);let extra={};
 if(kind==='wrapper-extra')writeFileSync(join(f.path,'notes'),'keep');
 if(kind==='hardlink')linkSync(join(f.path,'source','hello.txt'),join(f.root,'outside-hardlink'));
 if(kind==='dirty')writeFileSync(join(f.path,'source','hello.txt'),'unsaved');
 if(kind==='untracked')writeFileSync(join(f.path,'source','notes'),'unsaved');
 if(kind==='ignored'){mkdirSync(join(f.path,'source','.git','info'),{recursive:true});writeFileSync(join(f.path,'source','.git','info','exclude'),'secret\n');writeFileSync(join(f.path,'source','secret'),'unsaved');}
 if(kind==='active-writer'||kind==='visibility')extra.quiescence=()=>{throw Error(kind);};
 const result=f.call(f.request,extra);assert.equal(result.state,'blocked',JSON.stringify(result));assert.equal(lstatSync(f.path).mode&0o777,0o750);
 assert.equal(existsSync(join(f.path,'source','hello.txt')),true);
});
test('unsupported helper policy and unprivileged process inspection preserve the directory',async t=>{
 const f=await deletionFixture(t);delete f.policy.cleanup;assert.ok(f.call().blockers.includes('unsupported_capability'));assert.ok(existsSync(f.path));
 if(process.getuid()!==0)assert.throws(()=>assertNoWriters(f.policy),/unsupported_capability/);
});
test('forged binding, arbitrary path, competing operation and destination collision are refused',async t=>{
 const f=await deletionFixture(t);assert.throws(()=>validated('ssh-cleanup-delete-request',{...f.request,path:'/'}));
 const forged=structuredClone(f.request);forged.operation.inputs.receiptDigest='b'.repeat(64);forged.operation.requestDigest=requestDigest(forged.operation);assert.notEqual(f.call(forged).state,'prepared');
 const prepared=f.call();assert.equal(prepared.state,'prepared');
 const other=structuredClone(f.request);other.requestId=other.operation.operationId='another';other.operation.requestDigest=requestDigest(other.operation);assert.notEqual(f.call(other).state,'prepared');
 mkdirSync(join(f.policy.roots[0].path,'.labstride-deleting'),{mode:0o700});mkdirSync(f.destination);writeFileSync(join(f.destination,'foreign'),'keep');
 assert.notEqual(f.call(f.commit(prepared.preparation)).state,'deleted');assert.equal(readFileSync(join(f.destination,'foreign'),'utf8'),'keep');assert.ok(existsSync(f.path));
});
test('target fencing denies checkout reuse and runtime attachment until confirmed release',async t=>{
 const f=await deletionFixture(t);assert.equal(f.call().state,'prepared');const registry=new WorkspaceRegistry(f.policy);t.after(()=>registry.close());
 assert.notEqual((await registry.handle({schemaVersion:'2.0',method:'inspect',operation:f.operation,requestId:f.operation.operationId,installationId:f.policy.installationId,targetId:f.policy.targetId,targetRevision:1})).outcome,'ok');
 assert.throws(()=>registry.beginUse('runtime',f.receipt.workspaceId),/resource_busy/);
 assert.equal(f.call({...f.request,method:'release'}).state,'released');assert.equal((await registry.inspectOperation(f.operation.operationId)).outcome,'ok');
});
for(const stage of ['intent','fenced','prepared','moving','moved','unlink','removed','tombstone'])test(`AC20 actual helper SIGKILL at ${stage} reconciles only the captured resource`,async t=>{
 const f=await deletionFixture(t);let request=f.request;
 if(['moving','moved','unlink','removed','tombstone'].includes(stage)){const prepared=f.call();assert.equal(prepared.state,'prepared');request=f.commit(prepared.preparation);}
 const spec=join(f.root,'kill.json');writeFileSync(spec,JSON.stringify({policy:f.policy,repository:f.repository,request,stage}),{mode:0o600});
 const child=fork(new URL('./helpers/cleanup-delete-process.mjs',import.meta.url),[spec],{stdio:['ignore','pipe','pipe','ipc']});
 const exit=once(child,'exit');let errors='';child.stderr.on('data',c=>errors+=c);
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exit;}});
 const message=async()=>Promise.race([once(child,'message',{signal:AbortSignal.timeout(15000)}).then(x=>x[0]),exit.then(()=>{throw Error(errors);})]);
 assert.equal((await message()).stage,'ready');const paused=message();child.send('go');assert.equal((await paused).stage,stage);child.kill('SIGKILL');await exit;
 if(['moved','unlink','removed','tombstone'].includes(stage)){mkdirSync(f.path);writeFileSync(join(f.path,'foreign'),'replacement');}
 const result=f.call({...f.request,method:'inspect'});
 if(['moved','unlink','removed','tombstone'].includes(stage)){
  assert.equal(result.state,'deleted',JSON.stringify(result));assert.equal(readFileSync(join(f.path,'foreign'),'utf8'),'replacement');assert.deepEqual(f.call({...f.request,method:'inspect'}).tombstone,result.tombstone);
 }else{assert.notEqual(result.state,'deleted');assert.ok(existsSync(f.path));}
});

test('internal symlinks are unlinked without following their external targets',async t=>{
 const f=await deletionFixture(t),foreign=join(f.root,'foreign');mkdirSync(foreign);writeFileSync(join(foreign,'keep'),'survive');
 mkdirSync(join(f.path,'source','.git','info'),{recursive:true});writeFileSync(join(f.path,'source','.git','info','exclude'),'cache\n');
 mkdirSync(join(f.path,'source','cache'));symlinkSync(foreign,join(f.path,'source','cache','link'));
 f.op.inputs.policy.regenerableIgnoredPaths=['cache'];f.op.requestDigest=requestDigest(f.op);
 const prepared=f.call();assert.equal(prepared.state,'prepared');assert.equal(f.call(f.commit(prepared.preparation)).state,'deleted');assert.equal(readFileSync(join(foreign,'keep'),'utf8'),'survive');
});
test('active target runtime use prevents fencing',async t=>{
 const f=await deletionFixture(t),registry=new WorkspaceRegistry(f.policy);t.after(()=>registry.close());registry.beginUse('runtime',f.receipt.workspaceId);
 assert.notEqual(f.call().state,'prepared');assert.equal(lstatSync(f.path).mode&0o777,0o750);registry.endUse('runtime');assert.equal(f.call().state,'prepared');
});
test('stale authorization and changed preparation digest cannot move a directory',async t=>{
 const f=await deletionFixture(t),prepared=f.call();const commit=f.commit(prepared.preparation);commit.authorization.expiresAt='2000-01-01T00:00:00Z';
 assert.equal(f.call(commit).state,'prepared');commit.authorization.expiresAt=new Date(Date.now()+30000).toISOString();commit.authorization.preparedDigest='f'.repeat(64);
 assert.equal(f.call(commit).state,'prepared');assert.ok(existsSync(f.path));
});

for(const kind of ['wrapper','directory','file'])test(`AC19 real ${kind} bind mount is rejected in a private mount namespace`,async t=>{
 if(process.getuid()!==0){t.skip('Requires an isolated root-operated mount namespace');return;}
 const {execFileSync}=await import('node:child_process');
 try{execFileSync('/usr/bin/unshare',['--mount','--propagation','private','--',process.execPath,new URL('./helpers/cleanup-mount-process.mjs',import.meta.url).pathname,kind],{stdio:['ignore','pipe','pipe'],timeout:15000});}
 catch(error){if(/unshare:.*(?:Operation not permitted|Permission denied)/.test(error.stderr?.toString()??'')){t.skip('Private mount namespace is unavailable');return;}throw error;}
});
test('AC19 foreign filesystem owner is refused before removal',async t=>{
 if(process.getuid()!==0){t.skip('Requires a disposable root-operated ownership fixture');return;}
 const {chownSync}=await import('node:fs'),f=await deletionFixture(t);chownSync(f.path,65533,65533);
 assert.notEqual(f.call().state,'deleted');assert.ok(existsSync(join(f.path,'source','hello.txt')));
});
test('Linux writer fencing rejects a live coding process holding an open checkout file',async t=>{
 if(process.getuid()!==0){t.skip('Requires root process visibility and a disposable coding UID');return;}
 const f=await deletionFixture(t),{spawn}=await import('node:child_process');
 const writer=spawn(process.execPath,['-e',"require('node:fs').openSync(process.argv[1],'r');process.stdout.write('ready');setInterval(()=>{},1000)",join(f.path,'source','hello.txt')],
  {uid:f.policy.codingUid,gid:f.policy.codingGid,stdio:['ignore','pipe','pipe']});
 const exited=once(writer,'exit');t.after(async()=>{if(writer.exitCode===null&&writer.signalCode===null){writer.kill('SIGKILL');await exited;}});
 // Grant traversal solely within this disposable fixture so the child can hold
 // the descriptor before cleanup revokes access to the owned wrapper.
 chmodSync(f.root,0o755);chmodSync(f.policy.roots[0].path,0o755);chmodSync(f.path,0o755);
 await once(writer.stdout,'data',{signal:AbortSignal.timeout(5000)});chmodSync(f.path,0o750);
 const result=f.call(f.request,{quiescence:assertNoWriters});assert.notEqual(result.state,'prepared');assert.ok(existsSync(f.path));
});

for(const kind of ['symlink','foreign'])test(`AC19 ${kind} replacement after fencing preserves both directories`,async t=>{
 const f=await deletionFixture(t),foreign=join(f.root,'foreign');mkdirSync(foreign);writeFileSync(join(foreign,'keep'),'survive');
 const result=f.call(f.request,{barrier(stage){if(stage==='fenced'){
  renameSync(f.path,f.path+'.original');if(kind==='symlink')symlinkSync(foreign,f.path);else{mkdirSync(f.path);writeFileSync(join(f.path,'foreign'),'keep');}
 }}});
 assert.notEqual(result.state,'deleted');assert.ok(existsSync(join(f.path+'.original','source','hello.txt')));assert.equal(readFileSync(join(foreign,'keep'),'utf8'),'survive');
});
test('AC19 root replacement at the move boundary is rejected before removal',async t=>{
 const f=await deletionFixture(t),prepared=f.call(),root=f.policy.roots[0].path;
 const result=f.call(f.commit(prepared.preparation),{barrier(stage){if(stage==='moving'){renameSync(root,root+'.original');mkdirSync(root,{mode:0o700});writeFileSync(join(root,'foreign'),'keep');}}});
 assert.notEqual(result.state,'deleted');assert.ok(existsSync(join(root+'.original',f.receipt.locator,'source','hello.txt')));assert.equal(readFileSync(join(root,'foreign'),'utf8'),'keep');
});

test('malformed deletion requests are rejected before helper registry initialization',async t=>{
 const {workspaceFixture}=await import('./helpers/workspace-fixture.mjs'),{serve}=await import('../apps/target-helper/main.ts');
 const f=workspaceFixture(t);
 async function* input(){yield Buffer.from(JSON.stringify({schemaVersion:'5.0',method:'delete',path:'/'}));}
 await assert.rejects(serve(f.policyFile,input(),()=>{throw Error('unexpected reply');}));assert.equal(existsSync(join(f.policy.stateDir,'target.sqlite')),false);
});

test('replacement deletion area cannot convert a missing destination into a tombstone',async t=>{
 const f=await deletionFixture(t),prepared=f.call(),area=join(f.policy.roots[0].path,'.labstride-deleting');
 const result=f.call(f.commit(prepared.preparation),{barrier(stage){if(stage==='moved'){
  renameSync(area,area+'.original');mkdirSync(area,{mode:0o700});writeFileSync(join(area,'foreign'),'keep');
 }}});
 assert.equal(result.tombstone,null);assert.equal(f.call({...f.request,method:'inspect'}).tombstone,null);
 assert.equal(readFileSync(join(area,'foreign'),'utf8'),'keep');assert.ok(existsSync(join(area+'.original',f.destination.split('/').at(-1),'source','hello.txt')));
});
test('an unrecognized missing source is uncertain and never fabricates deletion',async t=>{
 const f=await deletionFixture(t);renameSync(f.path,f.path+'.saved');const result=f.call();assert.equal(result.state,'outcome_unknown');assert.equal(result.tombstone,null);assert.ok(existsSync(join(f.path+'.saved','source','hello.txt')));
});
