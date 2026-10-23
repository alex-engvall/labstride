import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startCoordinator} from '../apps/coordinator/main.ts';
import {createGitHubWorker} from '../packages/core/github-worker.ts';
import {createObservationWorker} from '../packages/core/observation-worker.ts';
import {githubFixture,localAuthority} from './helpers/github-fixture.mjs';
import {seed,schedule} from './helpers/execution-fixture.mjs';
import {checkedProvider} from './helpers/checked-projection.mjs';
const message=async p=>(await once(p,'message',{signal:AbortSignal.timeout(10000)}))[0];
async function child(t,file,args){const p=fork(new URL(`./helpers/${file}`,import.meta.url),args,{stdio:['ignore','pipe','pipe','ipc']});p.exited=once(p,'exit');
  t.after(async()=>{if(p.exitCode===null&&p.signalCode===null){p.kill('SIGKILL');await p.exited;}});assert.equal((await message(p)).stage,'ready');return p;}
for(const stage of ['history-uncommitted','history-committed','admission-committed'])test(`SIGKILL at ${stage} retains one original request across provider recovery`,async t=>{
  const f=await githubFixture(t);await f.worker.tick();f.advance();f.change();
  writeFileSync(join(f.root,'provider-page.json'),JSON.stringify({item:f.item,events:f.events,now:f.now()}));
  const p=await child(t,'github-process.mjs',[stage,f.root]),barrier=message(p);p.send('go');assert.equal((await barrier).stage,stage);p.kill('SIGKILL');await p.exited;
  const reboot=startCoordinator(f.root,{policyAuthority:localAuthority,clock:{now:f.now}});t.after(()=>reboot.store.close());
  const w=createGitHubWorker(reboot.store,f.options);await w.tick();f.advance();await w.tick();
  const records=reboot.store.snapshot().records;assert.equal(records.filter(r=>r.kind==='run').length,1);assert.equal(records.filter(r=>r.kind==='workspace').length,1);
  assert.equal(records.find(r=>r.kind==='request').generation,1);
});
for(const stage of ['before-write','after-write','after-ack'])test(`SIGKILL at checked projection ${stage} never replays a possibly completed write`,async t=>{
  const root=mkdtempSync(join(tmpdir(),'labstride-checked-crash-')),{store}=startCoordinator(root);seed(store);const plan=schedule(store),projection=plan.projections[0],target=join(root,'remote.sqlite'),external=checkedProvider(target,projection);
  t.after(()=>{external.close();store.close();rmSync(root,{recursive:true,force:true});});
  const p=await child(t,'checked-process.mjs',[stage,root,target,projection.id]),barrier=message(p);p.send('go');assert.equal((await barrier).stage,stage);p.kill('SIGKILL');await p.exited;
  const reboot=startCoordinator(root,{clock:{now:()=> '2098-01-01T00:00:00.000Z'}});t.after(()=>reboot.store.close());
  const w=createObservationWorker(reboot.store,{sessions:new Map(),projections:new Map([[projection.providerId,external.adapter]])});await w.tick();await w.tick();
  assert.equal(external.count(),stage==='before-write'?0:1);
  assert.equal(reboot.store.delivery(`projection:${projection.id}`).state,stage==='after-ack'?'done':'reconcile');
});
