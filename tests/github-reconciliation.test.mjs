import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {startCoordinator} from '../apps/coordinator/main.ts';
import {createGitHubWorker} from '../packages/core/github-worker.ts';
import {GitHubError} from '../packages/core/github.ts';
import {githubFixture,localAuthority} from './helpers/github-fixture.mjs';
const counts=f=>{const db=new DatabaseSync(join(f.root,'state.sqlite'));try{return Object.fromEntries(['requests','runs','workspaces','operations','outbox'].map(table=>[table,Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n)]));}finally{db.close();}};

test('initial import is inert; a missed current transition admits one generation across concurrent workers and restart',async t=>{
  const f=await githubFixture(t);await f.worker.tick();assert.equal(counts(f).runs,0);
  f.advance();f.change();const other=createGitHubWorker(f.store,f.options);
  await Promise.all([f.worker.tick(),f.worker.tick(),other.tick()]);
  assert.deepEqual(counts(f),{requests:1,runs:1,workspaces:1,operations:1,outbox:1});
  const original=f.store.get('run','run-example-001');
  const reboot=startCoordinator(f.root,{policyAuthority:localAuthority,clock:{now:f.now}});t.after(()=>reboot.store.close());
  const worker=createGitHubWorker(reboot.store,f.options);f.advance();await worker.tick();
  assert.deepEqual(reboot.store.get('run','run-example-001'),original);assert.equal(counts(f).runs,1);
});
test('historical matching status and newly re-added membership cannot import a start',async t=>{
  const f=await githubFixture(t);f.change();await f.worker.tick();assert.equal(counts(f).runs,0);
  f.present(false);f.advance();await f.worker.tick();f.present(true);f.advance();
  f.events.push({...f.events[0],id:'membership-2'});await f.worker.tick();assert.equal(counts(f).runs,0);
});
test('same-second events are reconstructed from state links, not returned order',async t=>{
  const f=await githubFixture(t);await f.worker.tick();f.advance();f.change(null);f.change();
  [f.events[1],f.events[2]]=[f.events[2],f.events[1]];await f.worker.tick();assert.equal(counts(f).runs,1);
});
test('ambiguous event order is diagnostic and creates no execution graph',async t=>{
  const f=await githubFixture(t);await f.worker.tick();f.advance();f.change();f.change('wait-a');f.change();f.change('wait-a');f.change();
  await f.worker.tick();assert.equal(counts(f).runs,0);assert.equal(f.store.githubItemDiagnostics(f.key)[0].code,'history_ambiguous');
});
test('impossible same-second histories have bounded classification work',{timeout:2000},async t=>{
  const f=await githubFixture(t);await f.worker.tick();f.advance();f.item.fields.request={present:true,value:'go-a'};
  for(let i=0;i<12;i++)f.events.push({id:`self-${i}`,kind:'status',scopeId:'scope-a',actorId:'operator-test',occurredAt:f.now(),previousStatus:'Waiting',status:'Waiting'});
  await f.worker.tick();assert.equal(counts(f).runs,0);assert.equal(f.store.githubItemDiagnostics(f.key)[0].code,'history_ambiguous');
});
test('stable option IDs survive display renames and a renamed start value is admitted',async t=>{
  const f=await githubFixture(t);await f.worker.tick();f.item.optionNames.request['go-a']='Execute';f.item.optionNames.request['wait-a']='Backlog';f.advance();f.change();
  await f.worker.tick();assert.equal(counts(f).runs,1);
});
test('ambiguous historical option names do not bind to a different ID',async t=>{
  const f=await githubFixture(t);await f.worker.tick();f.item.optionNames.request['go-a']='Waiting';f.advance();f.change();await f.worker.tick();
  assert.equal(counts(f).runs,0);assert.equal(f.store.githubItemDiagnostics(f.key)[0].code,'history_ambiguous');
});
for(const actor of [null,'unapproved-actor'])test(`independent history actor ${actor} cannot authorize a run`,async t=>{
  const f=await githubFixture(t);await f.worker.tick();f.advance();f.change('go-a',actor);await f.worker.tick();assert.equal(counts(f).runs,0);
});
test('a fetched transition with no corresponding history is blocked',async t=>{
  const f=await githubFixture(t);await f.worker.tick();f.advance();f.item.fields.request={present:true,value:'go-a'};await f.worker.tick();
  assert.equal(counts(f).runs,0);assert.equal(f.store.githubItemDiagnostics(f.key)[0].code,'history_unavailable');
});
test('delayed provider history retains the previous field baseline and recovers the original transition after restart',async t=>{
  const f=await githubFixture(t);await f.worker.tick();f.advance();f.item.fields.request={present:true,value:'go-a'};await f.worker.tick();assert.equal(counts(f).runs,0);
  f.events.push({id:'late-status',kind:'status',scopeId:'scope-a',actorId:'operator-test',occurredAt:f.now(),previousStatus:'Waiting',status:'Start'});
  const reboot=startCoordinator(f.root,{policyAuthority:localAuthority,clock:{now:f.now}});t.after(()=>reboot.store.close());
  f.advance();await createGitHubWorker(reboot.store,f.options).tick();assert.equal(counts(f).runs,1);
});
test('partial history pages survive reopening and cannot start until terminal provider refresh',async t=>{
  const f=await githubFixture(t);await f.worker.tick();f.advance();f.change();
  f.adapter.history=async()=>({schemaVersion:'1.0',events:[f.events.at(-1)],hasNextPage:true,endCursor:'page-2'});
  await f.worker.tick();assert.equal(counts(f).runs,0);assert.equal(f.store.githubItems(f.key)[0].cursor,'page-2');
  f.adapter.history=async()=>({schemaVersion:'1.0',events:[],hasNextPage:false,endCursor:'page-2'});
  const reboot=startCoordinator(f.root,{policyAuthority:localAuthority,clock:{now:f.now}});t.after(()=>reboot.store.close());
  await createGitHubWorker(reboot.store,f.options).tick();assert.equal(counts(f).runs,1);
});
test('invalid history cursor rebuilds an inert baseline without deleting existing identities',async t=>{
  const f=await githubFixture(t);await f.worker.tick();f.advance();f.change();const history=f.adapter.history;
  f.adapter.history=async()=>{throw new GitHubError('invalid_cursor');};await f.worker.tick();assert.equal(counts(f).runs,0);
  f.adapter.history=history;f.advance();await f.worker.tick();assert.equal(counts(f).runs,0);
});
for(const code of ['graphql_errors','rate_limited','credential_expired'])test(`${code} preserves checkpoints and applies durable backoff`,async t=>{
  const f=await githubFixture(t);await f.worker.tick();f.advance();const before=f.store.githubStatus(f.key);
  f.adapter.list=async()=>{throw new GitHubError(code,120000);};await f.worker.tick();const after=f.store.githubStatus(f.key);
  assert.equal(after.cursor,before.cursor);assert.equal(after.epoch,before.epoch);assert.equal(after.lastError,code);
  const calls=f.calls();await f.worker.tick();assert.equal(f.calls(),calls);assert.ok(Date.parse(after.nextAt)>=Date.parse(f.now())+120000);
});
test('a newer human edit after candidate persistence supersedes the pending start',async t=>{
  const f=await githubFixture(t);await f.worker.tick();f.advance();f.change();
  const admit=f.store.admitGitHubCandidate.bind(f.store);let first=true;
  f.store.admitGitHubCandidate=()=>null;await f.worker.tick();assert.equal(f.store.githubCandidates(f.key).length,1);
  f.store.admitGitHubCandidate=admit;f.change('wait-a');await f.worker.tick();assert.equal(counts(f).runs,0);assert.equal(f.store.githubCandidates(f.key).length,0);
});
