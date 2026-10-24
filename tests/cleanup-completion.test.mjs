import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { successorFixture } from './helpers/deployment-successor-fixture.mjs';
import { localAuthority, context } from './helpers/configuration-fixture.mjs';
import { createCleanupWorker } from '../packages/core/cleanup-worker.ts';

async function fixture(t,{direct=false}={}){
 const x=await successorFixture(t,{direct,configure(f){const artifactPath=join(f.root,'cleanup.json');const r=spawnSync(process.execPath,['scripts/package_extension.mjs','packages/action-workspace-cleanup',artifactPath],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 f.dependencies.lock.extensions.push({id:'labstride.workspace-cleanup',version:'1.0.0',kind:'action',artifactPath,integrity:createHash('sha256').update(readFileSync(artifactPath)).digest('hex'),permissions:[],capabilities:['cleanup.assess.v1'],configuration:{}});
 f.config.cleanup={schemaVersion:'1.0',trigger:'operator_request',actionId:'labstride.workspace-cleanup',actionVersion:'1.0.0',completion:'merge_and_deployment',regenerableIgnoredPaths:[]};}});
 x.store.requestCleanup(x.earlier.runId,'completion-check',localAuthority,context);
 const options={host:x.f.dependencies.host,mergeProvider:x.mergeProviders[0],observers:x.observers,inspect:async()=>{throw Error('No target deletion fixture in this scoped completion test');}};
 return {...x,get store(){return x.store;},options,worker:()=>createCleanupWorker(x.store,options)};
}
test('direct independently verified deployment satisfies only the completion gate; other cleanup gates remain mandatory',async t=>{
 const x=await fixture(t,{direct:true}),c=x.store.cleanupContext('completion-check');
 const blockers=x.store.cleanupLocalBlockers(c);assert.equal(blockers.includes('deployment_unverified'),false,JSON.stringify(blockers));
 const decision=await x.worker().assess('completion-check');assert.equal(decision.blockers.includes('target_observation_unknown'),false);assert.equal(decision.eligible,false);assert.equal(x.store.cleanupRequests(x.earlier.runId)[0].operation,null);
 await x.configureTarget({health:'unhealthy'});assert.ok((await x.worker().assess('completion-check')).blockers.includes('target_observation_unknown'));
});
test('successor containment is rechecked independently of historical workflow fulfillment',async t=>{
 const x=await fixture(t);assert.ok(x.store.cleanupLocalBlockers(x.store.cleanupContext('completion-check')).includes('successor_unverified'));
 await x.reconcile(x.earlier);x.store.consumeSuccessorEvidence(x.earlier.operationId);
 assert.equal(x.store.cleanupLocalBlockers(x.store.cleanupContext('completion-check')).includes('successor_unverified'),false);
 assert.equal((await x.worker().assess('completion-check')).blockers.includes('target_observation_unknown'),false);
 x.advance();await x.configureTarget({observedAt:x.now()});
 assert.equal((await x.worker().assess('completion-check')).blockers.includes('target_observation_unknown'),false,'fresh target observation replaces expired health sample');
 x.store.workflowConflict(x.successor.operationId);
 assert.ok(x.store.cleanupLocalBlockers(x.store.cleanupContext('completion-check')).includes('deployment_unverified'));
});
test('unknown, failed, and target-held delivery preserve cleanup even with a confirmed merge',async t=>{
 const x=await fixture(t,{direct:true});
 const c=x.store.cleanupContext('completion-check');assert.equal(c.merges[0].record.outcome,'confirmed');
 for(const state of ['failed','outcome_unknown']){const modified=structuredClone(c);modified.deployments[0].state=state;assert.ok(x.store.cleanupLocalBlockers(modified).includes('deployment_unverified'));}
 const resource=c.deployments[0].order.resourceKey;x.store.db.prepare('INSERT INTO resource_holds VALUES (?,?)').run(resource,'uncertain_delivery');
 assert.ok(x.store.cleanupLocalBlockers(x.store.cleanupContext('completion-check')).includes('deployment_unverified'));
});
