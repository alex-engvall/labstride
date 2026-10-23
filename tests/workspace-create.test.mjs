import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { WorkspaceRegistry } from '../packages/target-helper/workspaces.ts';
import { TargetRegistry } from '../packages/target-helper/registry.ts';
import { workspaceIdentity } from '../packages/target-helper/workspace-contracts.ts';
import { sourceAccess,runGit } from '../packages/target-helper/workspace-git.ts';
import { requestDigest } from '../packages/storage-sqlite/execution.ts';
import { workspaceFixture } from './helpers/workspace-fixture.mjs';
const inspect=request=>({...request,method:'inspect'});
const open=(t,f,extra={})=>{const registry=new WorkspaceRegistry(f.policy,{...f.dependencies,...extra});t.after(()=>registry.close());return registry;};
const actualGit=(directory,args)=>execFileSync('/usr/bin/git',['-c',`safe.directory=${directory}`,...args],{cwd:directory,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
test('AC08 exact older SHA and two issues have independent owned source clones/branches',async t=>{
  const f=workspaceFixture(t),registry=open(t,f),one=await registry.handle(f.request);
  assert.equal(one.outcome,'ok');const first=one.workspace;
  assert.equal(actualGit(f.sourcePath(first),['rev-parse','HEAD']),f.operation.source.sha);
  assert.equal(actualGit(f.sourcePath(first),['branch','--show-current']),first.branch);
  assert.equal(existsSync(join(f.sourcePath(first),'later.txt')),false);
  assert.equal(readFileSync(join(f.sourcePath(first),'hello.txt'),'utf8'),'original source\n');
  const other=structuredClone(f.request);other.operation.operationId+=':second';other.requestId=other.operation.operationId;
  other.operation.workspaceId+=':second';other.operation.runId+=':second';other.operation.requestDigest=requestDigest(other.operation);
  const second=await registry.handle(other);assert.equal(second.outcome,'ok');assert.notEqual(second.workspace.locator,first.locator);assert.notEqual(second.workspace.branch,first.branch);
  assert.notEqual(actualGit(f.sourcePath(first),['rev-parse','--absolute-git-dir']),actualGit(f.sourcePath(second.workspace),['rev-parse','--absolute-git-dir']));
  assert.equal(f.fetches(),2);assert.equal((await registry.handle(f.request)).outcome,'ok');assert.equal(f.fetches(),2);
});
test('AC09 retained receipt after lost acknowledgement recovers exact resource and preserves later edits',async t=>{
  const f=workspaceFixture(t),registry=open(t,f,{barrier(stage){if(stage==='committed')throw Error('reply lost');}});
  assert.equal((await registry.handle(f.request)).outcome,'outcome_unknown');
  const reboot=open(t,f),reply=await reboot.handle(inspect(f.request));assert.equal(reply.outcome,'ok');
  writeFileSync(join(f.sourcePath(reply.workspace),'hello.txt'),'human edits\n');
  // This hostile config must never run in the helper's privileged inspection.
  actualGit(f.sourcePath(reply.workspace),['config','core.fsmonitor','touch forbidden-marker']);
  assert.deepEqual((await reboot.handle(inspect(f.request))).workspace,reply.workspace);
  assert.equal(readFileSync(join(f.sourcePath(reply.workspace),'hello.txt'),'utf8'),'human edits\n');assert.equal(f.fetches(),1);
  assert.equal(existsSync(join(f.sourcePath(reply.workspace),'forbidden-marker')),false);
});
for(const stage of ['intent','staging','materialized','promoted','accessible','committed'])test(`interruption at ${stage} never repeats materialization`,async t=>{
  const f=workspaceFixture(t),registry=open(t,f,{barrier(at){if(stage===at)throw Error('interrupted');}});
  assert.equal((await registry.handle(f.request)).outcome,'outcome_unknown');const before=f.fetches();
  const reply=await open(t,f).handle(inspect(f.request));
  assert.equal(reply.outcome,['accessible','committed'].includes(stage)?'ok':'outcome_unknown');
  await registry.handle(f.request);assert.equal(f.fetches(),before);
});
test('foreign final or staging directories and symlinks are preserved before intent',async t=>{
  for(const [suffix,linked] of [['',false],['.stage',false],['',true]]){
    const f=workspaceFixture(t),registry=open(t,f),path=join(f.policy.roots[0].path,workspaceIdentity(f.policy.installationId,f.policy.targetId,f.operation.workspaceId).locator+suffix);
    if(linked)symlinkSync(f.repository,path);else mkdirSync(path);
    const response=await registry.handle(f.request);assert.equal(response.outcome,'error');assert.equal(response.error.code,'resource_busy');assert.ok(lstatSync(path));assert.equal(f.fetches(),0);
  }
});
test('different digest/workspace owner and replacement paths cannot be adopted',async t=>{
  const f=workspaceFixture(t),registry=open(t,f),reply=await registry.handle(f.request);assert.equal(reply.outcome,'ok');
  const changed=structuredClone(f.request);changed.operation.source.sha='a'.repeat(40);changed.operation.inputs.source=changed.operation.source;changed.operation.requestDigest=requestDigest(changed.operation);
  assert.equal((await registry.handle(changed)).error.code,'identity_mismatch');
  const path=join(f.policy.roots[0].path,reply.workspace.locator);renameSync(path,path+'.retained');mkdirSync(path,{mode:0o750});
  assert.notEqual((await registry.handle(inspect(f.request))).outcome,'ok');assert.ok(existsSync(path+'.retained'));
});
test('wrong source identity, arbitrary input, deadline and absent inspection cause no clone',async t=>{
  const f=workspaceFixture(t),registry=open(t,f);
  assert.equal((await registry.handle(inspect(f.request))).outcome,'outcome_unknown');
  for(const change of [op=>op.inputs.command='touch injected',op=>op.source.repository='foreign/repo',op=>op.deadline='2000-01-01T00:00:00Z']){
    const req=structuredClone(f.request);change(req.operation);req.operation.requestDigest=requestDigest(req.operation);
    const reply=await registry.handle(req);assert.notEqual(reply.outcome,'ok');
  }
  assert.equal(f.fetches(),0);
});
test('failed actual Git fetch retains the original uncertain intent and staging path',async t=>{
  const f=workspaceFixture(t);f.operation.source.sha='a'.repeat(40);f.operation.inputs.source=f.operation.source;f.operation.requestDigest=requestDigest(f.operation);
  const registry=open(t,f);assert.equal((await registry.handle(f.request)).outcome,'outcome_unknown');
  await registry.handle(f.request);await registry.handle(inspect(f.request));assert.equal(f.fetches(),1);
  assert.equal(readdirSync(f.policy.roots[0].path).length,1);
});
test('additive registry migration retains legacy reservation and v1 registry remains readable',async t=>{
  const f=workspaceFixture(t),{codingGid,sources,...old}=f.policy;old.schemaVersion='1.0';
  const {targetFixture}=await import('./helpers/ssh-fixture.mjs');
  const legacy=new TargetRegistry(old);legacy.close();const registry=open(t,f);const reply=await registry.handle(f.request);assert.equal(reply.outcome,'ok');
  const reopened=new TargetRegistry(old);reopened.close();
  const db=new DatabaseSync(join(f.policy.stateDir,'target.sqlite'),{readOnly:true});try{assert.equal(db.prepare('PRAGMA user_version').get().user_version,2);assert.equal(db.prepare('SELECT count(*) n FROM workspace_creations').get().n,1);}finally{db.close();}
});
test('private source credential stays out of the owned checkout and receipt',async t=>{
  const f=workspaceFixture(t),secret='synthetic-source-secret-only';const key=join(f.root,'source-secret');writeFileSync(key,secret,{mode:0o600});f.policy.sources[0].credentialFile=key;
  const registry=open(t,f),reply=await registry.handle(f.request);assert.equal(reply.outcome,'ok');assert.equal(JSON.stringify(reply).includes(secret),false);
  function scan(path){for(const entry of readdirSync(path,{withFileTypes:true})){const child=join(path,entry.name);if(entry.isDirectory())scan(child);else if(entry.isFile())assert.equal(readFileSync(child).includes(Buffer.from(secret)),false,entry.name);}}
  scan(join(f.policy.roots[0].path,reply.workspace.locator));
  chmodSync(key,0o644);assert.throws(()=>sourceAccess(f.policy.sources[0]));
});
test('concurrent duplicate requests create once, conflict is reconcilable and preserves one registry row',async t=>{
  const f=workspaceFixture(t),registry=open(t,f);const replies=await Promise.all([registry.handle(f.request),registry.handle(f.request)]);
  assert.equal(replies.filter(reply=>reply.outcome==='ok').length,1);assert.equal(f.fetches(),1);
  assert.equal((await registry.handle(inspect(f.request))).outcome,'ok');
});
for(const stage of ['intent','materialized','accessible','committed'])test(`actual SIGKILL at ${stage} retains original workspace operation`,async t=>{
  const {fork}=await import('node:child_process'),{once}=await import('node:events');
  const f=workspaceFixture(t),spec=join(f.root,'crash.json'),fetchLog=join(f.root,'fetches');
  writeFileSync(spec,JSON.stringify({policy:f.policy,request:f.request,repository:f.repository,stage,fetchLog}),{mode:0o600});
  const child=fork(new URL('./helpers/workspace-process.mjs',import.meta.url),[spec],{stdio:['ignore','pipe','pipe','ipc']});
  let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);const exited=once(child,'exit');
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}});
  const message=async()=>Promise.race([once(child,'message',{signal:AbortSignal.timeout(10000)}).then(([value])=>value),exited.then(()=>{throw Error('Unexpected child exit: '+stderr);})]);
  assert.equal((await message()).stage,'ready');const barrier=message();child.send('go');assert.equal((await barrier).stage,stage);child.kill('SIGKILL');await exited;
  const response=await open(t,f).handle(inspect(f.request));assert.equal(response.outcome,['accessible','committed'].includes(stage)?'ok':'outcome_unknown');
  assert.equal(f.fetches(),0);assert.equal(existsSync(fetchLog)?readFileSync(fetchLog,'utf8').trim().split('\n').length:0,stage==='intent'?0:1);
});
for(const authenticated of [false,true])test(`real HTTPS Git/API ${authenticated?'private authenticated':'public anonymous'} transport verifies exact revision`,async t=>{
  const {fork,spawn}=await import('node:child_process'),{once}=await import('node:events');
  const f=workspaceFixture(t),certificate=join(f.root,'certificate.pem'),key=join(f.root,'certificate-key.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',certificate,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
  chmodSync(certificate,0o600);execFileSync('/usr/bin/git',['clone','--bare',f.repository,join(f.root,'source.git')],{stdio:'ignore'});
  execFileSync('/usr/bin/git',['--git-dir='+join(f.root,'source.git'),'config','uploadpack.allowReachableSHA1InWant','true'],{stdio:'ignore'});
  const secret=authenticated?'synthetic-https-read-credential':null,secretFile=join(f.root,'source-credential');
  if(secret)writeFileSync(secretFile,secret,{mode:0o600});
  const serverSpec=join(f.root,'server.json');writeFileSync(serverSpec,JSON.stringify({root:f.root,key,certificate,secret,repositoryId:f.operation.source.repositoryId,repository:f.operation.source.repository}),{mode:0o600});
  const server=fork(new URL('./helpers/workspace-https-server.mjs',import.meta.url),[serverSpec],{stdio:['ignore','pipe','pipe','ipc']});
  const stopped=once(server,'exit');t.after(async()=>{if(server.exitCode===null&&server.signalCode===null){server.kill('SIGTERM');await stopped;}});
  const {port}=(await once(server,'message',{signal:AbortSignal.timeout(10000)}))[0];
  Object.assign(f.policy.sources[0],{gitUrl:`https://127.0.0.1:${port}/source.git`,apiUrl:`https://127.0.0.1:${port}/api`,credentialFile:secret?secretFile:null});
  const clientSpec=join(f.root,'client.json');writeFileSync(clientSpec,JSON.stringify({policy:f.policy,request:f.request}),{mode:0o600});
  const client=spawn(process.execPath,[new URL('./helpers/workspace-https-client.mjs',import.meta.url).pathname,clientSpec],{env:{PATH:'/usr/bin:/bin',NODE_EXTRA_CA_CERTS:certificate},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';client.stdout.on('data',c=>stdout+=c);client.stderr.on('data',c=>stderr+=c);const [code]=await once(client,'exit');assert.equal(code,0,stderr);
  const result=JSON.parse(stdout);assert.equal(result.created.outcome,'ok',JSON.stringify(result)+' '+stderr);assert.deepEqual(result.created.workspace,result.inspected.workspace);
  assert.equal(actualGit(f.sourcePath(result.created.workspace),['rev-parse','HEAD']),f.operation.source.sha);
  const pending=once(server,'message',{signal:AbortSignal.timeout(10000)});server.send('report');const [report]=await pending;
  assert.equal(report.api,1);assert.ok(report.fetches>=1);assert.equal(report.rejected,0);
  if(secret){
    assert.equal(stdout.includes(secret),false);assert.equal(stderr.includes(secret),false);assert.equal(readFileSync(join(f.sourcePath(result.created.workspace),'.git/config'),'utf8').includes(secret),false);
    const previous=process.env.NODE_EXTRA_CA_CERTS;process.env.NODE_EXTRA_CA_CERTS=certificate;
    try{assert.throws(()=>runGit(f.sourcePath(result.created.workspace),['push','origin','HEAD:refs/heads/forbidden'],sourceAccess(f.policy.sources[0])),error=>error.code==='operation_failed');}
    finally{if(previous===undefined)delete process.env.NODE_EXTRA_CA_CERTS;else process.env.NODE_EXTRA_CA_CERTS=previous;}
    assert.throws(()=>execFileSync('/usr/bin/git',['--git-dir='+join(f.root,'source.git'),'show-ref','--verify','refs/heads/forbidden'],{stdio:'ignore'}));
  }
});
