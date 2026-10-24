import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { configurationFixture, observation, context, localAuthority, policyDependencies, fixtureActorEvidence, publishFixturePolicy } from './configuration-fixture.mjs';
import { workspaceFixture } from './workspace-fixture.mjs';
import { workspaceStart } from '../../packages/storage-sqlite/workflows.ts';
import { startCoordinator } from '../../apps/coordinator/main.ts';
import { WorkspaceRegistry } from '../../packages/target-helper/workspaces.ts';
import { configuredMergeAction } from '../../packages/github-merge/action.ts';
import { GitHubMergeProvider } from '../../packages/provider-github/merges.ts';
import { mergeTarget } from './merge-target.mjs';
import { RuntimeRegistry } from '../../packages/target-helper/runtimes.ts';
import { digest } from '../../packages/configuration/json.ts';
import { inspectCleanup } from '../../packages/target-helper/cleanup.ts';
import { createCleanupWorker } from '../../packages/core/cleanup-worker.ts';

export async function cleanupFixture(t,{trigger='operator_request',alternative=false,optionalRuntime=false,configure}={}) {
  const target=workspaceFixture(t),root=target.root,f=configurationFixture(root);
  Object.assign(f.source,target.operation.source); f.config.github.repositories=[f.source.repository];
  Object.assign(target.policy,{installationId:f.config.installationId,targetId:'target-a'});
  const pack=(directory,id,configuration={},capabilities,transform)=>{
    const artifactPath=join(root,id+'.json'),run=spawnSync(process.execPath,['scripts/package_extension.mjs',directory,artifactPath],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    if(transform){const artifact=JSON.parse(readFileSync(artifactPath));transform(artifact);writeFileSync(artifactPath,JSON.stringify(artifact));}
    const artifact=JSON.parse(readFileSync(artifactPath)),m=artifact.manifest;
    const pin={id:m.id,version:m.version,kind:m.kind,artifactPath,integrity:createHash('sha256').update(readFileSync(artifactPath)).digest('hex'),
      permissions:m.permissions,capabilities:capabilities??m.capabilities,configuration};
    f.dependencies.lock.extensions.push(pin);return pin;
  };
  pack('packages/action-workspace-create','workspace');
  const e={schemaVersion:'1.0',repository:{name:f.source.repository,nodeId:f.source.repositoryId,id:1001},targetId:'target-a',baseBranch:'main',method:'merge',
    credentialRef:'secret:repository',protectionCredentialRef:'secret:project',appId:123,installationId:456,actorId:789,
    checks:[{context:'build',appId:15368},{context:'DCO',appId:927}],workflows:[{id:201,path:'.github/workflows/ci.yml',blobSha:'f'.repeat(40),appId:15368}],
    downstream:{id:202,path:'.github/workflows/downstream.yml',blobSha:'f'.repeat(40),appId:15368},qualification:{mergeSha:'d'.repeat(40),pullRequest:10,runId:41}};
  pack('packages/action-github-merge','merge',{enrollments:{selected:e}});
  const cleanupPin=pack('packages/action-workspace-cleanup','cleanup',{},undefined,alternative?artifact=>{
    artifact.manifest.id='test.retaining-cleanup';artifact.module=artifact.module.replace('async validate(){}',"async validate(operation){if(operation.actionId!=='test.retaining-cleanup')throw Error('identity_mismatch');}");artifact.module=artifact.module.replace("cleanupDisposition:'pending_executor'","cleanupDisposition:'retain'");
  }:undefined);
  f.config.cleanup={schemaVersion:'1.0',trigger,actionId:cleanupPin.id,actionVersion:cleanupPin.version,completion:'merge_only',regenerableIgnoredPaths:[]};
  f.config.workflows.prepare=[{id:'checkout',action:'labstride.workspace-create',inputs:{target:'target-a',rootId:'source',source:'context.source'}},
    {id:'merge',action:'labstride.github-merge',inputs:{schemaVersion:'1.0',enrollment:'selected',target:'target-a',source:'context.source',pullRequest:11,expectedHead:f.source.sha}}];
  let runtimeInstallation,runtimeReceipt;
  if(optionalRuntime){
    pack('packages/action-runtime-create','runtime');
    for(const name of ['runtime-state','services'])mkdirSync(join(root,name),{mode:0o700});
    const driver=join(root,'driver.mjs');copyFileSync('examples/runtime-recipes/node-resources.mjs',driver);chmodSync(driver,0o600);
    const recipe={id:'example.sqlite',version:'1.0.0',driver:{path:driver,integrity:createHash('sha256').update(readFileSync(driver)).digest('hex')},
      configuration:{kind:'sqlite',root:join(root,'services')},resources:[{key:'db',type:'database'}],cleanup:{actionId:'example.runtime-stop',actionVersion:'1.0.0',trigger},timeoutMs:10000};
    runtimeInstallation={schemaVersion:'3.0',workspacePolicy:target.policy,runtimePolicy:{schemaVersion:'1.0',installationId:target.policy.installationId,targetId:'target-a',targetRevision:1,helperUid:process.getuid(),stateDir:join(root,'runtime-state'),recipes:[recipe]}};
    f.config.workflows.prepare.splice(1,0,{id:'runtime',action:'labstride.runtime-create',inputs:{target:'target-a',rootId:'source',workspaceOperationId:'op-'+digest([f.config.installationId,'test.provider','issue-test',1]),recipe:{id:recipe.id,version:recipe.version,digest:digest(recipe)}}});
  }
  if(configure)await configure(f,cleanupPin);
  f.config.targets['target-a'].configuration.revision=1;
  const connector=f.dependencies.lock.extensions.find(p=>p.kind==='connector'), artifact=JSON.parse(readFileSync(connector.artifactPath));
  artifact.schemas.configuration.properties.revision={type:'integer'};writeFileSync(connector.artifactPath,JSON.stringify(artifact));
  const c=await f.compile();assert.equal(c.ok,true,JSON.stringify(c.diagnostics));const compiled=c.configuration;
  let now=new Date().toISOString(),nowOverride=null,store;
  const dependencies={...policyDependencies,actorVerifier:observed=>fixtureActorEvidence(observed,f.source),clock:{now:()=>nowOverride??new Date().toISOString()}};
  const state=join(root,'coordinator');store=startCoordinator(state,dependencies).store;
  t.after(()=>store?.close());store.activateConfiguration(compiled,null,context,localAuthority);publishFixturePolicy(store,f,compiled);
  const observed=observation(f,compiled);observed.event.observedAt=now;observed.event.occurredAt=now;
  const admitted=store.requestConfiguredStart(compiled,observed,{source:f.source},(steps,obs)=>workspaceStart(compiled,steps,obs),context);
  assert.equal(admitted.evaluation.outcome,'matched',JSON.stringify(admitted));const runId=admitted.runId;
  const op=store.operations(runId)[0].request,registry=new WorkspaceRegistry(target.policy,target.dependencies);
  let receipt;
  try {
    const claim=store.claim(op.operationId,'checkout-test','checkout');store.beginEffect(claim,false,true);
    const reply=await registry.handle({schemaVersion:'2.0',requestId:op.operationId,installationId:target.policy.installationId,targetId:'target-a',targetRevision:1,method:'create',operation:op});
    assert.equal(reply.outcome,'ok',JSON.stringify(reply));receipt=reply.workspace;
    store.acceptResult({schemaVersion:'1.0',kind:'result',operationId:op.operationId,requestDigest:op.requestDigest,result:{status:'succeeded',handle:op.operationId,
      resources:[{id:receipt.handle,type:'source-checkout',state:'ready'}],outputs:{workspace:receipt},evidenceRefs:['test:actual-checkout'],error:null}},claim,1,[],undefined,true);
  }finally{registry.close();}
  const workspace=store.workspace(runId);store.setWorkspaceKeep(workspace.id,false,workspace.revision,localAuthority,context);
  store.advanceWorkflows(f.dependencies.host);
  if(optionalRuntime){
    const runtimeOp=store.operations(runId).at(-1).request;
    // The source operation identity is deterministic at admission; freeze this
    // exact identity in the approved workflow before compilation below.
    const registry=new RuntimeRegistry(runtimeInstallation);
    try{
      const claim=store.claim(runtimeOp.operationId,'runtime-test','runtime');store.beginEffect(claim);
      const reply=await registry.handle({schemaVersion:'3.0',method:'create',requestId:runtimeOp.operationId,installationId:target.policy.installationId,targetId:'target-a',targetRevision:1,operation:runtimeOp});
      assert.equal(reply.outcome,'ok',JSON.stringify(reply));runtimeReceipt=reply.runtime;
      store.acceptResult({schemaVersion:'1.0',kind:'result',operationId:runtimeOp.operationId,requestDigest:runtimeOp.requestDigest,result:{status:'succeeded',handle:runtimeOp.operationId,resources:runtimeReceipt.resources.map(r=>({id:r.name,type:r.type,state:r.state})),outputs:{runtime:runtimeReceipt},evidenceRefs:['test:actual-sqlite-runtime'],error:null}},claim,1);
    }finally{registry.close();}
    store.advanceWorkflows(f.dependencies.host);
  }
  const mergeOp=store.operations(runId).at(-1).request;assert.equal(mergeOp.actionId,'labstride.github-merge');
  const providerTarget=await mergeTarget(t,root,e,f.source.sha);
  const provider=new GitHubMergeProvider({credential:async reference=>reference,identity:()=>({appId:e.appId,installationId:e.installationId,repositoryIds:[e.repository.id],contents:'write'}),fetch:providerTarget.transport});
  const adapter=configuredMergeAction(store,f.dependencies.host,provider),claim=store.claim(mergeOp.operationId,'merge-test','merge');store.beginEffect(claim);
  const merged=await adapter.start(mergeOp,claim);assert.equal(merged.result.status,'succeeded',JSON.stringify(merged));store.acceptResult(merged,claim,1);
  store.managedRunActive(runId);store.managedRunComplete(runId);
  let keep=false, inspectCalls=0;
  const options={host:f.dependencies.host,mergeProvider:provider,async inspect(request){inspectCalls++;return inspectCleanup(target.policy,request,target.dependencies,{remote:target.repository,allowFileTransport:true});},
  };
  // Match the full existing provider item schema with a qualified snapshot.
  options.keepItem=async()=>({schemaVersion:'1.0',scopeId:f.config.fields.keep.scopeId,itemId:'item',subjectId:observed.event.subjectId,repositoryId:f.source.repositoryId,
    repository:f.source.repository,sourceSha:f.source.sha,updatedAt:now,fields:{keep:{present:true,value:keep}},optionNames:{}});
  let id;
  if(trigger==='operator_request')id=store.requestCleanup(runId,'cleanup-operator',localAuthority,context);
  else {store.scheduleCompletionCleanup();id=store.cleanupRequests(runId)[0].id;}
  return {f,target,root,runId,id,receipt,op,mergeOp,provider,providerTarget,compiled,options,state,dependencies,cleanupPin,runtimeReceipt,
    get store(){return store;},path:target.sourcePath(receipt),get inspectCalls(){return inspectCalls;},
    worker:()=>createCleanupWorker(store,options),setKeep(value){keep=value;},setNow(value){nowOverride=value;},
    reopen(){store.close();store=startCoordinator(state,dependencies).store;return store;}};
}
