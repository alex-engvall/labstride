import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {startCoordinator} from '../apps/coordinator/main.ts';
import {createWorker,actionKey} from '../packages/core/worker.ts';
import {seed,schedule,nextIssue,nextGeneration,context} from './helpers/execution-fixture.mjs';
export const fail=code=>e=>e.code===code;
export function fixture(t) {
 const root=mkdtempSync(join(tmpdir(),'labstride-scheduling-'));
 const {store}=startCoordinator(join(root,'state'));seed(store);const plan=schedule(store);
 t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});return {root,store,plan};
}
export function result(plan,status='succeeded') { return {schemaVersion:'1.0',kind:'result',operationId:plan.operation.id,requestDigest:plan.operation.request.requestDigest,
 result:{status,handle:`handle:${plan.operation.id}`,resources:[],outputs:{},evidenceRefs:['test:observed'],error:status==='outcome_unknown'?{code:'outcome_unknown',message:'Unresolved',evidenceId:null,retryClass:'reconcile'}:null}}; }
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('two independent effects overlap; global capacity queues the third and survives reboot',async t=>{
 const {store,root,plan}=fixture(t);const two=nextIssue(store),three=nextIssue(store,3);let starts=[];const finish=[];
 const adapter={async validate(){},async start(request){starts.push(request.operationId);await new Promise(r=>finish.push(r));return result([plan,two,three].find(p=>p.operation.id===request.operationId));},async reconcile(){throw Error();}};
 const worker=createWorker(store,{executorId:'test',nextAttempt:()=>crypto.randomUUID(),adapters:new Map([[actionKey(plan.operation.request.actionId,plan.operation.request.actionVersion),adapter]])});
 await worker.tick();await turn();assert.deepEqual(starts,[plan.operation.id,two.operation.id]);
 assert.equal(store.schedulingStatus(three.run.id).reserved,false);
 const reboot=startCoordinator(join(root,'state'));t.after(()=>reboot.store.close());
 assert.equal(reboot.store.schedulingStatus(plan.run.id).reserved,true);assert.equal(reboot.store.schedulingStatus(two.run.id).reserved,true);
 finish.forEach(r=>r());await worker.drain();await worker.tick();await turn();assert.equal(starts.length,2); // run reservations outlive individual actions
 await worker.close();
});
test('distinct development and CI/review limits do not share operation permits',async t=>{
 const {store,plan}=fixture(t);const two=nextIssue(store),three=nextIssue(store,3,'ciReview');
 store.configureScheduling({schemaVersion:'1.0',activeRuns:3,development:1,ciReview:1},context);
 const first=store.claim(plan.operation.id,'one','one');store.beginEffect(first);
 assert.throws(()=>store.claim(two.operation.id,'two','two'),fail('capacity_wait'));
 // FIFO admission must reserve the waiting development run, while the CI operation may proceed.
 const ci=store.claim(three.operation.id,'ci','ci');store.beginEffect(ci);
 assert.equal(store.schedulingStatus(two.run.id).reserved,true);
});
test('same issue cannot start another generation even under a changed installation snapshot',t=>{
 const {store,plan}=fixture(t);assert.throws(()=>nextGeneration(store),fail('issue_busy'));
 const request=store.get('request',plan.request.id);assert.equal(request.generation,1);
 assert.equal(store.get('operation',plan.operation.id).state,'prepared');
});
test('separate real Git checkouts and branches are used for concurrent issues',t=>{
 const {root}=fixture(t);const source=join(root,'source');mkdirSync(source);
 const git=(cwd,...args)=>execFileSync('git',args,{cwd,stdio:'pipe'});
 git(source,'init','--initial-branch=main');writeFileSync(join(source,'README'),'owned fixture\n');git(source,'add','README');
 git(source,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture');
 const paths=[join(root,'one'),join(root,'two')];
 for(const [i,path] of paths.entries()){git(root,'clone','--no-hardlinks',source,path);git(path,'checkout','-b',`issue-${i}`);}
 writeFileSync(join(paths[0],'only-one'),'independent');
 assert.notEqual(git(paths[0],'rev-parse','--absolute-git-dir').toString(),git(paths[1],'rev-parse','--absolute-git-dir').toString());
 assert.equal(git(paths[1],'status','--porcelain').toString(),'');
});
test('v5 upgrade retains legacy conflicting identities and blocks both effect paths',async t=>{
 const {root,store,plan}=fixture(t);const two=nextIssue(store);
 const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(join(root,'state','state.sqlite'));
 // Reproduce the v5 layout and two starts permitted by its old scheduler, in this owned fixture only.
 db.prepare("UPDATE requests SET payload=json_set(payload,'$.issueId',?,'$.generation',2) WHERE id=?").run(plan.request.issueId,two.request.id);
 db.exec('DROP TABLE operation_scheduling; DROP TABLE run_admissions; DROP TABLE scheduling_policy; DELETE FROM schema_migrations WHERE version=6; PRAGMA user_version=5');db.close();
 const reboot=startCoordinator(join(root,'state'));t.after(()=>reboot.store.close());
 assert.equal(reboot.store.get('operation',plan.operation.id).id,plan.operation.id);
 assert.equal(reboot.store.get('operation',two.operation.id).id,two.operation.id);
 assert.equal(reboot.store.schedulingStatus(plan.run.id).issueConflict,true);
 for(const p of [plan,two])assert.throws(()=>reboot.store.claim(p.operation.id,'new','new'),e=>['issue_busy','effect_blocked'].includes(e.code));
});
