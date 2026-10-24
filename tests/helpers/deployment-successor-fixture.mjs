import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { orderingFixture } from './deployment-ordering-fixture.mjs';
import { mergeTarget } from './merge-target.mjs';
import { configuredMergeAction } from '../../packages/github-merge/action.ts';
import { GitHubMergeProvider } from '../../packages/provider-github/merges.ts';

export async function successorFixture(t, options = {}) {
  let e; const mergeProviders=[];
  const x=await orderingFixture(t,{configure(f){
    e={schemaVersion:'1.0',repository:{name:f.source.repository,nodeId:f.source.repositoryId,id:1001},targetId:'target-a',
      baseBranch:'main',method:'merge',credentialRef:'secret:repository',protectionCredentialRef:'secret:project',
      appId:123,installationId:456,actorId:789,checks:[{context:'build',appId:15368},{context:'DCO',appId:927}],
      workflows:[{id:201,path:'.github/workflows/ci.yml',blobSha:'f'.repeat(40),appId:15368}],
      downstream:{id:202,path:'.github/workflows/downstream.yml',blobSha:'f'.repeat(40),appId:15368},
      qualification:{mergeSha:'d'.repeat(40),pullRequest:10,runId:41}};
    const root=join(f.dependencies.lock.extensions[0].artifactPath,'..'),artifactPath=join(root,'merge.json');
    const packed=spawnSync(process.execPath,['scripts/package_extension.mjs','packages/action-github-merge',artifactPath],{encoding:'utf8'});assert.equal(packed.status,0,packed.stderr);
    f.dependencies.lock.extensions.push({id:'labstride.github-merge',version:'1.0.0',kind:'action',artifactPath,
      integrity:createHash('sha256').update(readFileSync(artifactPath)).digest('hex'),permissions:['network.github'],capabilities:['merge.current-revision.v1'],configuration:{enrollments:{selected:e}}});
    if(options.configure)options.configure(f);
    f.config.workflows.prepare.unshift({id:'merge',action:'labstride.github-merge',inputs:{schemaVersion:'1.0',enrollment:'selected',target:'target-a',source:'context.source',pullRequest:11,expectedHead:f.source.sha}});
  }});
  async function merge(op,sha,suffix){
    const directory=join(x.root,suffix);mkdirSync(directory);
    const target=await mergeTarget(t,directory,e,op.source.sha);target.state.mergeSha=sha;target.save();
    const provider=new GitHubMergeProvider({credential:async reference=>reference,identity:()=>({appId:e.appId,installationId:e.installationId,repositoryIds:[e.repository.id],contents:'write'}),fetch:target.transport});
    mergeProviders.push(provider);
    const adapter=configuredMergeAction(x.store,x.f.dependencies.host,provider),record=x.store.get('operation',op.operationId);
    const claim=x.store.claim(op.operationId,'merge-test','attempt');x.store.beginEffect(claim);
    const result=await adapter.start(op,claim);assert.equal(result.result.status,'succeeded',JSON.stringify(result));
    x.store.acceptResult(result,claim,record.revision);assert.equal(target.effects().length,1);
    x.store.advanceWorkflows(x.f.dependencies.host);
    const deployment=x.store.operations(op.runId).at(-1).request;
    assert.equal(deployment.actionId,'labstride.github-workflow');assert.equal(deployment.source.sha,sha);assert.equal(deployment.inputs.source.sha,sha);
    return deployment;
  }
  const a=await merge(x.op,x.b,'merge-a');
  const second=x.admit('-b');const b=await merge(second,x.c,'merge-b');
  if(options.direct){await x.start(a);await x.deliver(a);await x.reconcile(a);}
  else {await x.start(b);await x.deliver(b);await x.reconcile(b);await x.start(a);}
  return {...x,get store(){return x.store;},get url(){return x.url;},earlier:a,successor:b,mergeEnrollment:e,mergeProviders};
}
