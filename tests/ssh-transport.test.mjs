import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync, spawn, fork } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { freezeProfile } from '../packages/extensions/loader.ts';
import { targetFixture, enrollFixture, installedConnector } from './helpers/ssh-fixture.mjs';
import { requestDigest } from '../packages/storage-sqlite/execution.ts';
import { startCoordinator } from '../apps/coordinator/main.ts';
import { createWorker, actionKey } from '../packages/core/worker.ts';
import { createTargetReservationAction } from '../packages/connector-ssh/runtime.ts';
import { seed, startPlan, eventInput, context } from './helpers/execution-fixture.mjs';
import { DatabaseSync } from 'node:sqlite';
const sshd='/usr/sbin/sshd';
const skip=!existsSync(sshd)||process.getuid()!==0?'Requires an isolated root-operated OpenSSH server; exercised separately on the enrolled Linux pilot':false;
const key=path=>{execFileSync('ssh-keygen',['-q','-t','ed25519','-N','','-f',path]);return readFileSync(path+'.pub','utf8').split(' ').slice(0,2).join(' ');};
const probe=f=>({schemaVersion:'1.0',requestId:'probe',installationId:f.policy.installationId,targetId:f.policy.targetId,targetRevision:f.policy.targetRevision,method:'probe'});
const code=value=>error=>error.message===value||error.code===value;
async function transport(t,provided){
  // sshd StrictModes rejects /tmp even when sticky. /run has protected ancestry;
  // only this new test-owned directory is removed at teardown.
  const f=provided??targetFixture(t,'/run'),a=key(join(f.root,'host-a')),b=key(join(f.root,'host-b'));
  const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
  const e=enrollFixture(f,{port,hostKey:a,helperCommand:'/usr/local/bin/labstride-target-helper',timeoutMs:6000});t.after(()=>e.store.close());
  const marker=join(f.root,'executed'),behavior=join(f.root,'behavior.json');writeFileSync(behavior,JSON.stringify({mode:'normal'}),{mode:0o600});
  const command=['/usr/bin/env','-i','PATH=/usr/bin:/bin','NODE_NO_WARNINGS=1',...(f.certificate?[`NODE_EXTRA_CA_CERTS=${f.certificate}`]:[]),realpathSync(process.execPath),resolve('tests/helpers/ssh-helper-sentinel.mjs'),f.policyFile,marker,behavior].join(' ');
  assert.match(command,/^[A-Za-z0-9_./=: -]+$/);
  const configuration=join(f.root,'sshd.conf');
  writeFileSync(configuration,`Port ${port}\nListenAddress 127.0.0.1\nHostKey ${f.root}/host-a\nPidFile ${f.root}/sshd.pid\nAuthorizedKeysFile ${e.enrollment.identityFile}.pub\nStrictModes yes\nPermitRootLogin prohibit-password\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nUsePAM yes\nAllowUsers ${e.enrollment.user}\nAuthenticationMethods publickey\nPermitUserEnvironment no\nDisableForwarding yes\nPermitTTY no\nLogLevel ERROR\nForceCommand ${command}\n`,{mode:0o600});
  let server;
  async function stop(){if(server&&server.exitCode===null&&server.signalCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}}
  t.after(stop);
  async function start(hostKey='host-a'){
    await stop();
    server=spawn(sshd,['-D','-e','-f',configuration,'-h',join(f.root,hostKey)],{stdio:['ignore','pipe','pipe']});
    let stderr='';server.stderr.on('data',c=>stderr+=c);
    // Readiness is a TCP handshake only. No host key is accepted by this probe.
    const deadline=Date.now()+5000;
    while(Date.now()<deadline){
      if(server.exitCode!==null)throw Error(`sshd fixture failed: ${stderr}`);
      const {createConnection}=await import('node:net');
      const ready=await new Promise(r=>{const s=createConnection({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();r(true);});s.on('error',()=>r(false));});
      if(ready)return;
      await new Promise(r=>setTimeout(r,25));
    }
    throw Error('sshd fixture not ready');
  }
  await start();
  const installed=await installedConnector(f,e.configuration);
  return {...f,e,a,b,marker,behavior,configuration,start,...installed,
    calls:()=>existsSync(marker)?readFileSync(marker,'utf8').trim().split('\n').length:0};
}
test('AC07 real SSH host-key mismatch fails before any helper command; explicit rotation succeeds',{skip},async t=>{
  const f=await transport(t);assert.equal((await f.connector.invoke(probe(f))).outcome,'ok');assert.equal(f.calls(),1);
  // Replace only this disposable sshd's key, never the machine's system keys.
  let text=readFileSync(f.configuration,'utf8').replace(`HostKey ${f.root}/host-a`,`HostKey ${f.root}/host-b`);writeFileSync(f.configuration,text);
  await f.start('host-b');await assert.rejects(f.connector.invoke(probe(f)),code('identity_mismatch'));assert.equal(f.calls(),1);
  const current=f.e.store.publish({...f.e.enrollment,revision:2,hostKey:f.b},1,{actorId:'test-operator',reason:'Explicit isolated host key rotation'});
  f.policy.targetRevision=2;writeFileSync(f.policyFile,JSON.stringify(f.policy));
  const next=await installedConnector(f,current);assert.equal((await next.connector.invoke(probe(f))).outcome,'ok');assert.equal(f.calls(),2);
  await assert.rejects(f.connector.invoke({...probe(f),targetRevision:1}),code('identity_mismatch'));assert.equal(f.calls(),2);
});
test('AC06 hostile issue data cannot execute a command or select another root over real SSH',{skip},async t=>{
  const f=await transport(t);
  for(const value of [';touch injected','$(touch injected)','../foreign','/etc','https://untrusted.test/extension']){
    const request=structuredClone(f.request);request.operation.inputs.rootId=value;request.operation.requestDigest=requestDigest(request.operation);
    await assert.rejects(f.connector.invoke(request),code('validation_failed'));
  }
  assert.equal(f.calls(),0);assert.equal(existsSync(join(f.root,'injected')),false);
  const reply=await f.connector.invoke(f.request);assert.equal(reply.reservation.state,'reserved');assert.equal(f.calls(),1);
  assert.equal((await f.connector.invoke({...f.request,method:'inspect'})).outcome,'ok');assert.equal(f.calls(),2);
});
test('real SSH reply loss reconciles the original committed reservation through inspect',{skip},async t=>{
  const f=await transport(t);writeFileSync(f.behavior,JSON.stringify({mode:'drop-reply'}));
  await assert.rejects(f.connector.invoke(f.request),code('outcome_unknown'));assert.equal(f.calls(),1);
  writeFileSync(f.behavior,JSON.stringify({mode:'normal'}));
  const reply=await f.connector.invoke({...f.request,method:'inspect'});assert.equal(reply.outcome,'ok');assert.equal(reply.reservation.operationId,f.operation.operationId);assert.equal(f.calls(),2);
});
test('forged identity, malformed and oversized real SSH replies cannot become trusted results',{skip},async t=>{
  const f=await transport(t);
  for(const [mode,expected] of [['forged','identity_mismatch'],['malformed','outcome_unknown'],['oversized','outcome_unknown']]){
    writeFileSync(f.behavior,JSON.stringify({mode}));await assert.rejects(f.connector.invoke(f.request),code(expected));
  }
});
for(const stage of ['after-boundary','after-reply'])test(`SIGKILL coordinator ${stage} recovers by real SSH inspection without repeating reserve`,{skip},async t=>{
  const f=await transport(t),state=join(f.root,'coordinator'),first=startCoordinator(state);seed(first.store);
  const plan=startPlan();plan.operation.request=f.operation;plan.workspace.targetId=f.operation.targetId;
  first.store.scheduleStart(first.store.receive(eventInput()).id,plan,context);first.store.close();
  const spec=join(f.root,'worker.json');writeFileSync(spec,JSON.stringify({state,profile:f.profile,installationId:f.policy.installationId,stage}),{mode:0o600});
  const child=fork(new URL('./helpers/ssh-worker-process.mjs',import.meta.url),[spec],{stdio:['ignore','pipe','pipe','ipc']});
  const exited=once(child,'exit');t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}});
  const message=async()=>(await once(child,'message',{signal:AbortSignal.timeout(10000)}))[0];assert.equal((await message()).stage,'ready');
  const barrier=message();child.send('go');assert.equal((await barrier).stage,stage);child.kill('SIGKILL');await exited;
  const reboot=startCoordinator(state);t.after(()=>reboot.store.close());
  const action=createTargetReservationAction(async()=>({connector:f.connector,installationId:f.policy.installationId,revision:1}));
  const worker=createWorker(reboot.store,{executorId:'reboot',nextAttempt:()=> 'never-used',adapters:new Map([[actionKey(f.operation.actionId,f.operation.actionVersion),action]])});
  await worker.tick();await worker.drain();
  assert.equal(reboot.store.get('operation',f.operation.operationId).state,stage==='after-reply'?'succeeded':'outcome_unknown');
  assert.equal(f.calls(),stage==='after-reply'?2:1);
  const db=new DatabaseSync(join(f.policy.stateDir,'target.sqlite'),{readOnly:true});
  try{assert.equal(db.prepare('SELECT count(*) AS n FROM reservations').get().n,stage==='after-reply'?1:0);}finally{db.close();}
  assert.equal(reboot.store.snapshot().records.filter(row=>row.kind==='workspace').length,1);
});
test('AC09 real SSH and authenticated HTTPS source recover the same checkout after lost creation reply',{skip},async t=>{
  const {workspaceFixture,httpsSource}=await import('./helpers/workspace-fixture.mjs');
  const {workspaceTargetResolver}=await import('../packages/connector-ssh/workspaces.ts');
  const base=workspaceFixture(t,'/run'),https=await httpsSource(t,base);
  const f=await transport(t,{...base,certificate:https.certificate});
  const {configurationFixture}=await import('./helpers/configuration-fixture.mjs');
  const {configuredWorkspaceAction}=await import('../packages/connector-ssh/workspaces.ts');
  const configuration=configurationFixture(f.root);configuration.config.installationId=f.policy.installationId;
  const artifactPath=join(f.root,'workspace-action.artifact.json');execFileSync(process.execPath,['scripts/package_extension.mjs','packages/action-workspace-create',artifactPath]);
  const actionPin={id:'labstride.workspace-create',version:'1.0.0',kind:'action',artifactPath,integrity:(await import('node:crypto')).createHash('sha256').update(readFileSync(artifactPath)).digest('hex'),configuration:{},permissions:['filesystem.workspace'],capabilities:['workspace.create.v1']};
  const connectorPin={...f.pin,capabilities:['workspace.probe.v1','workspace.create.v1','workspace.inspect.v1']};
  configuration.dependencies.lock.extensions=[configuration.dependencies.lock.extensions.find(pin=>pin.kind==='provider'),connectorPin,actionPin];
  configuration.config.targets={[f.policy.targetId]:{connector:connectorPin.id,configuration:f.e.configuration}};
  configuration.config.workflows={prepare:[{id:'checkout',action:actionPin.id,inputs:{target:f.policy.targetId,rootId:'source',source:'context.source'}}]};
  const compilation=await configuration.compile();assert.equal(compilation.ok,true,JSON.stringify(compilation));
  const snapshot=compilation.configuration.snapshot;f.operation.configDigest=snapshot.digest;f.operation.requestDigest=requestDigest(f.operation);
  const host={protocol:{major:1,minor:0},permissions:['network.ssh','filesystem.workspace'],capabilities:[]};
  const action=configuredWorkspaceAction({runConfiguration:()=>snapshot},host);
  const connector=await workspaceTargetResolver(host).resolve(freezeProfile(f.operation.runId,f.operation.configDigest,connectorPin,host));
  await action.validate(f.operation);
  writeFileSync(f.behavior,JSON.stringify({mode:'drop-reply'}));
  await assert.rejects(action.start(f.operation,{}),code('outcome_unknown'));
  writeFileSync(f.behavior,JSON.stringify({mode:'normal'}));
  const result=await action.reconcile(f.operation,f.operation.operationId);assert.equal(result.result.status,'succeeded');
  const recovered={outcome:'ok',workspace:result.result.outputs.workspace};
  const path=f.sourcePath(recovered.workspace);assert.equal(execFileSync('/usr/bin/git',['-C',path,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),f.operation.source.sha);
  writeFileSync(join(path,'hello.txt'),'human changes survive\n');
  assert.deepEqual((await connector.invoke({...f.request,method:'inspect'})).workspace,recovered.workspace);
  assert.equal(readFileSync(join(path,'hello.txt'),'utf8'),'human changes survive\n');
  assert.equal(f.calls(),4);
  const db=new DatabaseSync(join(f.policy.stateDir,'target.sqlite'),{readOnly:true});try{assert.equal(db.prepare('SELECT count(*) n FROM workspace_creations').get().n,1);}finally{db.close();}
});
test('real SSH runtime recipe reply loss recovers the original database and v3 installation retains old probe formats',{skip},async t=>{
  const {runtimeFixture}=await import('./helpers/runtime-fixture.mjs');
  const {runtimeTargetResolver}=await import('../packages/connector-ssh/runtimes.ts');
  const base=await runtimeFixture(t,'/run'),f=await transport(t,base);writeFileSync(f.policyFile,JSON.stringify(f.installation));
  const host={protocol:{major:1,minor:0},permissions:['network.ssh'],capabilities:[]};
  const pin={...f.pin,capabilities:['runtime.probe.v1','runtime.create.v1','runtime.inspect.v1']};
  const connector=await runtimeTargetResolver(host).resolve(freezeProfile(f.operation.runId,f.operation.configDigest,pin,host));
  writeFileSync(f.behavior,JSON.stringify({mode:'drop-reply'}));await assert.rejects(connector.invoke(f.requestFor()),code('outcome_unknown'));
  writeFileSync(f.behavior,JSON.stringify({mode:'normal'}));const reply=await connector.invoke({...f.requestFor(),method:'inspect'});
  assert.equal(reply.outcome,'ok',JSON.stringify(reply));assert.equal(reply.runtime.operationId,f.operationFor().operationId);
  assert.deepEqual((await connector.invoke(f.requestFor())).runtime,reply.runtime);
  const legacy=await f.connector.invoke(probe(f));assert.equal(legacy.schemaVersion,'1.0');assert.deepEqual(legacy.capabilities,['target.probe.v1','target.reserve.v1','target.inspect.v1']);
  const {workspaceTargetResolver}=await import('../packages/connector-ssh/workspaces.ts');
  const sourceConnector=await workspaceTargetResolver(host).resolve(freezeProfile(f.operation.runId,f.operation.configDigest,{...f.pin,capabilities:['workspace.probe.v1','workspace.create.v1','workspace.inspect.v1']},host));
  assert.deepEqual((await sourceConnector.invoke({...f.request,method:'inspect'})).workspace,f.created);
  const db=new DatabaseSync(join(f.root,'runtime-state','runtimes.sqlite'),{readOnly:true});try{assert.equal(db.prepare('SELECT count(*) n FROM runtimes').get().n,1);}finally{db.close();}
});
