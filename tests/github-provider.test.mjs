import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {GitHubClient} from '../packages/provider-github/client.ts';
import {GitHubAdapter} from '../packages/provider-github/adapter.ts';
import {createGitHubWebhook} from '../packages/provider-github/webhook.ts';
import {githubFixture,localAuthority} from './helpers/github-fixture.mjs';
import {startCoordinator} from '../apps/coordinator/main.ts';
const error=code=>e=>e.code===code;
function client(response,options={}){return new GitHubClient({credential:async ref=>`opaque:${ref}`,fetch:async()=>response(),...options});}
test('partial GraphQL errors never yield usable data; invalid cursors are classified',async()=>{
  for(const [type,code] of [['INVALID_CURSOR_ARGUMENTS','invalid_cursor'],['FORBIDDEN','graphql_errors']]){
    const c=client(()=>Response.json({data:{node:{id:'partial'}},errors:[{type}]}));await assert.rejects(c.query('query{}',{},'project'),error(code));
  }
});
for(const [status,headers,code] of [[401,{},'credential_expired'],[403,{},'permission_denied'],[429,{'retry-after':'120'},'rate_limited'],[403,{'x-ratelimit-remaining':'0'},'rate_limited'],[503,{},'provider_unavailable']])test(`HTTP ${status} is bounded and classified as ${code}`,async()=>{
  const c=client(()=>new Response(null,{status,headers}));await assert.rejects(c.query('query{}',{},'project'),error(code));
});
test('request budget, response size, missing credentials and non-HTTPS configuration fail before effects',async()=>{
  let calls=0;const c=client(()=>{calls++;return Response.json({data:{ok:true}});},{requestsPerTick:2});
  await c.query('query{}',{},'project');await c.query('query{}',{},'project');await assert.rejects(c.query('query{}',{},'project'),error('budget_exhausted'));assert.equal(calls,2);
  const big=client(()=>new Response(' '.repeat(2097153)));await assert.rejects(big.query('query{}',{},'project'),error('response_too_large'));
  const missing=client(()=>assert.fail(),{credential:async()=>''});await assert.rejects(missing.query('query{}',{},'project'),error('credential_unavailable'));
  assert.throws(()=>client(()=>assert.fail(),{apiUrl:'http://untrusted.invalid/graphql'}),error('invalid_configuration'));
});
test('provider refresh resolves stable IDs and independently qualifies only the enrolled Status history',async t=>{
  const f=await githubFixture(t),requests=[];let startName='Start';
  const c=new GitHubClient({credential:async ref=>ref,fetch:async(_url,init)=>{
    const body=JSON.parse(init.body);requests.push({body,credential:init.headers.authorization});
    if(body.query.includes('LabstrideFields'))return Response.json({data:{node:{id:'scope-a',viewerCanUpdate:true,fields:{nodes:[{id:'request-a',name:'Renamed request',dataType:'SINGLE_SELECT',options:[{id:'go-a',name:startName},{id:'wait-a',name:'Waiting'}]}],pageInfo:{hasNextPage:false,endCursor:null}}}}});
    if(body.query.includes('LabstrideHistory'))return Response.json({data:{node:{timelineItems:{nodes:[{__typename:'ProjectV2ItemStatusChangedEvent',id:'probe-event',createdAt:f.now(),previousStatus:'Waiting',status:'Start',project:{id:'scope-a'},actor:{id:'operator-test'}}],pageInfo:{hasNextPage:false,endCursor:'probe-cursor'}}}}});
    throw Error('unexpected query');
  }});
  const adapter=new GitHubAdapter({providerId:'test.provider',configuration:f.config,client:c,historyQualifications:[{schemaVersion:'1.0',scopeId:'scope-a',fieldId:'request-a',subjectId:'issue-test',eventId:'probe-event',actorId:'operator-test',optionId:'go-a',status:'Start'}]});
  const binding=await adapter.describeField(f.config.fields.request,'secret:project');assert.equal(binding.history,true);assert.equal(binding.displayName,'Renamed request');assert.deepEqual(binding.optionIds,['go-a','wait-a']);
  assert.ok(requests.every(request=>request.credential==='Bearer secret:project'));
  startName='Renamed start';adapter.beginTick();assert.equal((await adapter.describeField(f.config.fields.request,'secret:project')).history,true);
  await assert.rejects(adapter.describeField(f.config.fields.request,'secret:repository'),error('unsupported_binding'));
  const unqualified=new GitHubAdapter({providerId:'test.provider',configuration:f.config,client:c,historyQualifications:[]});
  assert.equal((await unqualified.describeField(f.config.fields.request,'secret:project')).history,false);
});
test('signed webhook is durable across restart; payload origin cannot grant authority',async t=>{
  const f=await githubFixture(t),secret='owned-fixture-secret';
  const handler=createGitHubWebhook(f.store,{installationId:f.config.installationId,secret:async()=>secret});
  const bytes=JSON.stringify({actorId:'operator-test',origin:'human',approval:true,kind:'start.requested'});
  const request=(body=bytes,signature=createHmac('sha256',secret).update(body).digest('hex'))=>new Request('https://coordinator.test/github',{method:'POST',body,headers:{'x-github-delivery':'fixture-delivery','x-github-event':'issues','x-hub-signature-256':`sha256=${signature}`}});
  assert.equal((await handler(request(bytes,'0'.repeat(64)))).status,401);
  const response=await handler(request());assert.equal(response.status,202);const receipt=await response.json();assert.equal(receipt.durable,true);
  const reboot=startCoordinator(f.root,{policyAuthority:localAuthority});t.after(()=>reboot.store.close());
  const again=createGitHubWebhook(reboot.store,{installationId:f.config.installationId,secret:async()=>secret});assert.deepEqual(await(await again(request())).json(),receipt);
  assert.equal((await again(request('{}'))).status,409);assert.equal(f.store.snapshot().records.filter(record=>record.kind==='run').length,0);
});
test('webhook rejects oversized bodies before secret lookup and invalid JSON after signature verification',async t=>{
  const f=await githubFixture(t);let secrets=0;
  const handler=createGitHubWebhook(f.store,{installationId:f.config.installationId,maxBytes:10,secret:async()=>{secrets++;return 'key';}});
  assert.equal((await handler(new Request('https://coordinator.test',{method:'POST',body:'x'.repeat(11)}))).status,413);assert.equal(secrets,0);
  const body='{';const signature=createHmac('sha256','key').update(body).digest('hex');
  assert.equal((await handler(new Request('https://coordinator.test',{method:'POST',body,headers:{'x-hub-signature-256':`sha256=${signature}`}}))).status,400);
  f.store.receiveGitHubWebhook=()=>{throw Error('storage failed');};const handler2=createGitHubWebhook(f.store,{installationId:f.config.installationId,secret:async()=> 'key'});
  const valid='{}',sig=createHmac('sha256','key').update(valid).digest('hex');
  await assert.rejects(handler2(new Request('https://coordinator.test',{method:'POST',body:valid,headers:{'x-hub-signature-256':`sha256=${sig}`}})),/storage failed/);
});
