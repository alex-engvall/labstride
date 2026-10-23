import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startCoordinator} from '../apps/coordinator/main.ts';
import {createObservationWorker} from '../packages/core/observation-worker.ts';
import {checkedProvider} from './helpers/checked-projection.mjs';
import {seed,schedule,context} from './helpers/execution-fixture.mjs';
import {githubFixture} from './helpers/github-fixture.mjs';
import {createGitHubProjection} from '../packages/provider-github/projection.ts';
import {createGitHubWorker} from '../packages/core/github-worker.ts';
import {localAuthority} from './helpers/github-fixture.mjs';
function fixture(t){let now='2026-10-23T12:00:00.000Z';const root=mkdtempSync(join(tmpdir(),'labstride-checked-'));const {store}=startCoordinator(root,{clock:{now:()=>now}});seed(store);const plan=schedule(store),p=plan.projections[0],external=checkedProvider(join(root,'provider.sqlite'),p);
  t.after(()=>{external.close();store.close();rmSync(root,{recursive:true,force:true});});
  return{root,store,p,external,advance(){now=new Date(Date.parse(now)+120000).toISOString();}};
}
const worker=f=>createObservationWorker(f.store,{sessions:new Map(),projections:new Map([[f.p.providerId,f.external.adapter]]),random:()=>0});
test('checked projections require a durable acknowledgement and independent readback',async t=>{
  const f=fixture(t);await worker(f).tick();assert.equal(f.external.count(),1);assert.equal(f.store.delivery(`projection:${f.p.id}`).state,'done');assert.equal(f.external.view().appliedToken,null);
});
test('lost write response retains unknown identity across restart even when the desired value matches',async t=>{
  const f=fixture(t);f.external.adapter.dropReply=true;await worker(f).tick();f.advance();
  const reboot=startCoordinator(f.root);t.after(()=>reboot.store.close());await worker({...f,store:reboot.store}).tick();
  assert.equal(f.external.count(),1);assert.equal(reboot.store.delivery(`projection:${f.p.id}`).state,'reconcile');assert.equal(reboot.store.projectionDiagnostics()[0].uncertain,true);
  assert.throws(()=>reboot.store.clearProjectionConflict(f.p.id,context),e=>e.code==='recovery_required');
});
test('a human change before projection creates a persistent field conflict and performs no write',async t=>{
  const f=fixture(t);f.external.human();await worker(f).tick();assert.equal(f.external.count(),0);assert.equal(f.store.delivery(`projection:${f.p.id}`).state,'conflict');
  const next={...f.p,id:'later-progress',payload:{...f.p.payload,expectedFingerprint:'human-v3'}};
  f.store.commit([{record:next,expectedRevision:null}],context);f.store.enqueue('projection',next.id);f.advance();await worker(f).tick();assert.equal(f.external.count(),0);
});
test('a human edit after acknowledged mutation is visible and stops subsequent writes',async t=>{
  const f=fixture(t),write=f.external.adapter.write.bind(f.external.adapter);let after=false;
  f.external.adapter.write=async(...args)=>{const view=await write(...args);after=true;return view;};
  f.external.adapter.read=async()=>{if(after)f.external.human();return f.external.view();};
  await worker(f).tick();assert.equal(f.external.count(),1);assert.equal(f.store.delivery(`projection:${f.p.id}`).state,'conflict');assert.equal(f.external.view().value,'human');
});
test('unsent projections coalesce while an uncertain older write fences the next generation of progress',async t=>{
  const f=fixture(t),next={...f.p,id:'latest-progress'};f.store.commit([{record:next,expectedRevision:null}],context);f.store.enqueue('projection',next.id);
  await worker(f).tick();assert.equal(f.store.delivery(`projection:${f.p.id}`).state,'superseded');assert.equal(f.external.count(),1);
});
test('mapped operational facts create one durable technical projection and never change the start field',async t=>{
  const f=await githubFixture(t,{progress:true});await f.worker.tick();f.advance();f.change();await f.worker.tick();
  const diagnostics=f.store.projectionDiagnostics();assert.equal(diagnostics.length,1);const p=f.store.get('projection',diagnostics[0].projectionId);
  assert.equal(p.fieldId,'status-a');assert.equal(p.subjectId,'issue-test');assert.equal(p.providerTarget.resourceId,'item-test');assert.equal(p.payload.value,'busy-a');
  await f.worker.tick();assert.equal(f.store.projectionDiagnostics().length,1);assert.equal(f.item.fields.request.value,'go-a');
});
test('GitHub preflight failure is proven before mutation and a later retry can write once',async t=>{
  const f=await githubFixture(t,{progress:true});await f.worker.tick();f.advance();f.change();await f.worker.tick();let failed=true,writes=0;
  const scoped={withConfiguration(){return this;},async item(){return structuredClone(f.item);},async describeField(){if(failed)throw Error('read-only preflight unavailable');return{writable:true};},
    async setField(_scope,_item,_field,_type,value){writes++;f.item.fields.status={present:true,value};}};
  const adapter=createGitHubProjection(f.store,scoped),w=createObservationWorker(f.store,{sessions:new Map(),projections:new Map([['test.provider',adapter]])});
  await w.tick();assert.equal(writes,0);assert.equal(f.store.projectionDiagnostics()[0].uncertain,false);
  failed=false;f.advance();await w.tick();assert.equal(writes,1);assert.equal(f.store.projectionDiagnostics()[0].state,'done');
});
test('new configuration does not rebind progress from an existing run to the new technical field',async t=>{
  const f=await githubFixture(t,{progress:[{fact:'run.preparing',field:'status',value:'busy'}]});await f.worker.tick();f.advance();f.change();await f.worker.tick();
  const old=f.compiled;f.config.fields.status.fieldId='new-status';f.descriptors['new-status']={...f.descriptors['status-a'],fieldId:'new-status'};
  const result=await f.compile();assert.equal(result.ok,true);const compiled=result.configuration;
  f.store.activateConfiguration(compiled,f.store.get('installation',f.config.installationId).revision,context,localAuthority);
  const run=f.store.get('run','run-example-001');f.store.commit([{record:{...run,state:'preparing',revision:run.revision+1},expectedRevision:run.revision}],context);
  let pinned=false;f.adapter.withConfiguration=configuration=>{assert.equal(configuration.fields.status.fieldId,'status-a');pinned=true;return f.adapter;};
  await createGitHubWorker(f.store,{...f.options,compiled}).tick();assert.equal(pinned,true);
  const p=f.store.get('projection',f.store.projectionDiagnostics()[0].projectionId);assert.equal(p.fieldId,'status-a');assert.equal(f.store.runConfiguration(run.id).digest,old.snapshot.digest);
});
