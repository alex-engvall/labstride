import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { UnixRpc,createExtension } from '../packages/session-codex/index.mjs';
import { socketServer,frame } from './helpers/codex-socket.mjs';
import { correlateAnswer } from '../packages/session-codex/questions.ts';
import { startExecution } from '../apps/coordinator/runtime.ts';
import { setup,follow,host,context } from './helpers/session-fixture.mjs';
const sleep=()=>new Promise(resolve=>setTimeout(resolve,20));
async function fixture(t,options={}) {
  const root=mkdtempSync(join(tmpdir(),'labstride-codex-')),path=join(root,'backend.sock');
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const state={turn:'turn-1',status:'completed',version:'0.163.0',cwd:'/owned/test',history:true,...options.state};
  const server=await socketServer(path,async(request,connection)=>{
    if(options.handler){const result=await options.handler(request,connection,state);if(result!==null)return result;}
    switch(request.method){
      case 'initialize':return {userAgent:`codex/${state.version} linux`};
      case 'thread/read':return {thread:{id:'thread-test',cwd:state.cwd,source:'vscode',status:{type:state.status==='inProgress'?'active':'idle'}}};
      case 'thread/turns/list':if(!state.history)throw Error();return {data:state.turn?[{id:state.turn,status:state.status}]:[]};
      case 'thread/resume':return {thread:{id:'thread-test'}};
      case 'turn/interrupt':state.status='interrupted';return {};
      case 'thread/unsubscribe':return {status:'unsubscribed'};
    }
  },options);
  t.after(()=>server.close());
  const config={providerId:'example.session.codex',backendIdentity:'existing-daemon',databasePath:join(root,'observations.sqlite'),
    socketPath:path,sessionId:'thread-test',workspaceId:'workspace-test',workspacePath:'/owned/test',timeoutMs:300};
  const adapter=createExtension(config);t.after(()=>adapter.dispose());
  let id=0;
  const request=(command='observe',fields={})=>({schemaVersion:'1.0',operationId:`command-${++id}`,workspaceId:config.workspaceId,
    providerId:config.providerId,command,sessionId:command==='start'?null:config.sessionId,expectedLastTurnId:state.turn,
    expectedHumanActivityRevision:1,input:{},...fields});
  return {root,path,config,state,server,adapter,request};
}
test('Codex existing-session enrollment, resume and detach preserve identity and settings',async t=>{
  const f=await fixture(t,{fragment:true});
  for(const command of ['start','resume','close']){const result=await f.adapter.invoke(f.request(command));assert.equal(result.outcome,'ok');assert.equal(result.observation.sessionId,'thread-test');assert.equal(result.observation.state,'ready');}
  const methods=f.server.requests.map(r=>r.method);assert.equal(methods.includes('thread/start'),false);assert.equal(methods.includes('thread/settings/update'),false);
  assert.deepEqual(f.server.requests.find(r=>r.method==='thread/resume').params,{threadId:'thread-test',excludeTurns:true});
});
test('Codex stale or unsupported automatic sends never submit turn/start or turn/steer',async t=>{
  const f=await fixture(t);assert.equal((await f.adapter.invoke(f.request('send'))).code,'unsupported_capability');
  f.state.turn='human-turn';const reply=await f.adapter.invoke(f.request('send',{expectedLastTurnId:'turn-1',expectedHumanActivityRevision:1}));assert.equal(reply.code,'stale_revision');
  assert.equal(f.server.requests.some(r=>r.method==='turn/start'||r.method==='turn/steer'),false);
});
test('Codex monotonic observation revision and same session survive reconnect and adapter restart',async t=>{
  const f=await fixture(t);const first=await f.adapter.invoke(f.request());for(const socket of f.server.sockets)socket.destroy();await sleep();
  f.state.turn='human-turn';const second=await f.adapter.invoke(f.request());assert.equal(second.observation.humanActivityRevision,first.observation.humanActivityRevision+1);
  const next=createExtension(f.config);t.after(()=>next.dispose());const resumed=await next.invoke(f.request());assert.equal(resumed.observation.humanActivityRevision,second.observation.humanActivityRevision);
});
test('Codex unavailable history or wrong identity cannot be interpreted as an empty ready session',async t=>{
  const f=await fixture(t);f.state.history=false;await assert.rejects(f.adapter.invoke(f.request()));f.state.history=true;f.state.cwd='/foreign';await assert.rejects(f.adapter.invoke(f.request()));
  assert.equal(f.server.requests.some(r=>r.method==='turn/start'),false);
});
test('unqualified backend version fails before any session mutation',async t=>{
  const f=await fixture(t,{state:{version:'9.0.0'}});await assert.rejects(f.adapter.invoke(f.request('resume')));assert.deepEqual(f.server.requests.map(r=>r.method),['initialize']);
});
test('installed Codex profile blocks guarded sends before effect and rejects disabled hooks',async t=>{
  const f=await fixture(t),runtime=startExecution(join(f.root,'coordinator'),{actions:{executorId:'installed-codex',nextAttempt:()=>crypto.randomUUID(),adapters:new Map()},
    observations:{sessions:new Map(),projections:new Map()},installedSessions:{host,providerIds:['example.session.codex']}});
  t.after(()=>runtime.close());
  const enrolled=setup(runtime.store,f.root,'codex',{...f.config,backendIdentity:'test-backend',workspaceId:'ws-example-001',databasePath:join(f.root,'installed-observations.sqlite')});
  await runtime.tick();await runtime.drain();
  const session=runtime.store.get('session',enrolled.command.enrollmentId);
  const next=follow(enrolled,'blocked-send','send',{schemaVersion:'1.0',sessionGuard:{enrollmentId:session.id,sessionId:session.sessionId,
    expectedLastTurnId:session.lastTurnId,expectedHumanActivityRevision:session.humanActivityRevision}});
  await runtime.tick();await runtime.drain();
  assert.equal(runtime.store.get('operation',next.operation.id).effectBoundary,'not_crossed');assert.equal(runtime.store.delivery(`operation:${next.operation.id}`).lastError,'unsupported_capability');
  assert.throws(()=>runtime.store.receiveHook(session.id,{}),e=>e.code==='unsupported_capability');
  assert.equal(f.server.requests.some(r=>r.method==='turn/start'||r.method==='turn/steer'),false);
});
test('question requests are correlated metadata, durable and never automatically answered',async t=>{
  let announced=false;
  const f=await fixture(t,{handler(request,{send},state){
    if(request.method==='thread/turns/list'&&!announced){announced=true;send({method:'item/tool/requestUserInput',id:'question-request',params:{threadId:'thread-test',turnId:state.turn,itemId:'item-1',questions:[{id:'choice',question:'private text'}]}});}
    return null;
  }});
  const result=await f.adapter.invoke(f.request());assert.equal(result.observation.state,'waiting_human');
  const db=new DatabaseSync(f.config.databasePath);t.after(()=>db.close());const row=db.prepare('SELECT payload FROM question_events').get();assert.equal(row.payload.includes('private text'),false);
  assert.equal(JSON.parse(row.payload).questionIds[0],'choice');assert.equal(f.server.requests.some(r=>Object.hasOwn(r,'result')),false);
  const question=JSON.parse(row.payload),answer={schemaVersion:'1.0',sessionId:question.sessionId,turnId:question.turnId,requestId:question.requestId,answers:{choice:['chosen']}};
  assert.deepEqual(correlateAnswer(answer,question),answer);
  assert.throws(()=>correlateAnswer({...answer,turnId:'foreign'},question),e=>e.code==='stale_revision');
  assert.throws(()=>correlateAnswer(answer,{...question,status:'resolved'}),e=>e.code==='stale_revision');
});
test('interrupt is bound to the enrolled active turn; uncertain interrupt is never resent',async t=>{
  const f=await fixture(t,{state:{status:'inProgress'}});await f.adapter.invoke(f.request('interrupt'));
  assert.deepEqual(f.server.requests.find(r=>r.method==='turn/interrupt').params,{threadId:'thread-test',turnId:'turn-1'});
  const reply=await f.adapter.reconcile(f.request('interrupt'));assert.equal(reply.outcome,'outcome_unknown');assert.equal(f.server.requests.filter(r=>r.method==='turn/interrupt').length,1);
});
test('WebSocket rejects bad handshake and oversized frames, and bounds unknown RPC timeout',async t=>{
  const f=await fixture(t,{handler(request,{socket}){if(request.method==='test/oversize'){socket.write(Buffer.from([129,127,0,0,0,0,0,8,0,0]));return undefined;}if(request.method==='test/timeout')return undefined;return null;}});
  const client=new UnixRpc(f.path,100);t.after(()=>client.close());await assert.rejects(client.call('test/timeout',{}));await assert.rejects(client.call('test/oversize',{}));
  const bad=await socketServer(join(f.root,'bad.sock'),()=>({}),{badHandshake:true});t.after(()=>bad.close());const badClient=new UnixRpc(join(f.root,'bad.sock'),100);t.after(()=>badClient.close());await assert.rejects(badClient.open());
});

test('RPC rejections retain bounded native detail without changing the conservative error code', async t => {
  const f = await fixture(t, { handler(request, { send }) {
    if (request.method !== 'test/read-error') return null;
    send({ id: request.id, error: { code: -32601, message: 'list_turns is not supported yet' } });
    return undefined;
  } });
  const rpc = new UnixRpc(f.path, 300); t.after(() => rpc.close());
  await assert.rejects(rpc.call('test/read-error', {}), error => {
    assert.equal(error.message, 'rpc_rejected');
    assert.deepEqual(error.rpcError, { code: -32601, message: 'list_turns is not supported yet' });
    return true;
  });
});
