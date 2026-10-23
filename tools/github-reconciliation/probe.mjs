#!/usr/bin/env node
// Explicitly invoked integration probe. No application/workspace/deploy effect.
// Input: owned test issue identity JSON; output: secret-free receipt and journal.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {GitHubClient,object,nodes} from '../../packages/provider-github/client.ts';
import {GitHubAdapter} from '../../packages/provider-github/adapter.ts';
import {createGitHubWorker} from '../../packages/core/github-worker.ts';
import {createObservationWorker} from '../../packages/core/observation-worker.ts';
import {startCoordinator} from '../../apps/coordinator/main.ts';
import {configurationFixture,localAuthority,policyFor,planFor} from '../../tests/helpers/configuration-fixture.mjs';
import {requestDigest} from '../../packages/storage-sqlite/execution.ts';

const input=JSON.parse(readFileSync(resolve(process.argv[2]),'utf8'));
for(const key of ['repository','repositoryId','issueId','actorId','ownerId'])assert.equal(typeof input[key],'string');
assert.equal(typeof input.issueNumber,'number');
const root=mkdtempSync(join(tmpdir(),'labstride-w023-live-')),journalPath=join(root,'journal.json');
const journal={schemaVersion:'1.0',fixture:input,project:null,field:null,item:null,intent:null,checks:[],cleanupVerified:false};
const save=()=>writeFileSync(journalPath,JSON.stringify(journal,null,2)+'\n',{mode:0o600});save();
// Opting into --gh-cli explicitly selects the operator's existing CLI identity.
// Otherwise use two separately injected, named credentials. Never log tokens.
const cli=process.argv.includes('--gh-cli');
const credential=async reference=>{
  if(cli)return execFileSync('gh',['auth','token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const value=reference==='secret:project'?process.env.GH_PROBE_PROJECT_TOKEN:process.env.GH_PROBE_REPOSITORY_TOKEN;
  if(!value)throw Error('Missing named probe credential');return value;
};
const client=new GitHubClient({credential,requestsPerTick:1000});
const query=async(q,v={},ref='secret:project')=>object(await client.query(q,v,ref));
async function mutate(kind,q,variables,ref='secret:project'){
  assert.equal(journal.intent,null,'An uncertain prior mutation requires reconciliation');
  journal.intent={kind,nonce:randomUUID(),variables};save();
  const data=await query(q,variables,ref);
  journal.lastResult={kind,data};journal.intent=null;save();return data;
}
const receipt={schemaVersion:'1.0',fixture:input,checks:[],limitations:[
  cli?'Existing broad GitHub CLI credential; no minimal-permission qualification':'Explicit named credentials; grants require separate qualification',
  'Source/workspace action and installation pins use the public test fixture; no SSH workspace, agent turn, merge or deployment is executed',
  'Checked Project writes have no provider CAS or durable mutation identity; an unobservable concurrent overwrite remains possible',
  'Live response-loss recovery and local SIGKILL cases are recorded separately; full AC35/AC36 are not passed',
]};
let store;
try{
  const identity=await query('query($id:ID!){viewer{id} node(id:$id){... on Repository{id nameWithOwner issues(first:1){totalCount}}}}',{id:input.repositoryId},'secret:repository');
  assert.equal(object(identity.viewer).id,input.actorId);assert.equal(object(identity.node).nameWithOwner,input.repository);
  const created=await mutate('create-owned-project','mutation($input:CreateProjectV2Input!){createProjectV2(input:$input){projectV2{id number url}}}',
    {input:{ownerId:input.ownerId,title:`Labstride W02.3 verification ${randomUUID()}`}});
  journal.project=object(object(created.createProjectV2).projectV2);save();
  const projectId=journal.project.id;receipt.project=journal.project;
  const definition=await query('query($id:ID!){node(id:$id){... on ProjectV2{fields(first:100){nodes{... on ProjectV2SingleSelectField{id name options{id name color description}}}}}}}',{id:projectId});
  const status=nodes(object(object(definition.node).fields).nodes).find(field=>field.name==='Status');assert.ok(status);
  const options=nodes(status.options),wait=options[0],go=options[1];assert.ok(wait&&go);
  const technical=await mutate('create-owned-technical-field','mutation($input:CreateProjectV2FieldInput!){createProjectV2Field(input:$input){projectV2Field{... on ProjectV2Field{id name}}}}',
    {input:{projectId,dataType:'TEXT',name:'Labstride technical progress'}});
  journal.field=object(object(technical.createProjectV2Field).projectV2Field);save();
  const linked=await mutate('add-owned-issue-membership','mutation($input:AddProjectV2ItemByIdInput!){addProjectV2ItemById(input:$input){item{id}}}',{input:{projectId,contentId:input.issueId}});
  journal.item=object(object(linked.addProjectV2ItemById).item);save();
  const rootFixture=configurationFixture(root);
  const f=rootFixture;
  Object.assign(f.config.github,{repositories:[input.repository],actorIds:[input.actorId],pollIntervalSeconds:15});
  // Closed fixtures can be moved to Done by GitHub's built-in automation.
  // Every observed option must be configured; never coerce it to Waiting.
  f.config.fields={request:{source:'project_v2',scopeId:projectId,fieldId:status.id,type:'single-select',options:Object.fromEntries(options.map((option,index)=>[option.id===go.id?'go':option.id===wait.id?'wait':`observed_${index}`,option.id]))},
    status:{source:'project_v2',scopeId:projectId,fieldId:journal.field.id,type:'string'},note:{source:'native_issue',scopeId:input.repositoryId,fieldId:'body',type:'string'}};
  f.config.controls={};f.config.projections=[{fact:'run.queued',field:'status',value:'Queued'},{fact:'run.preparing',field:'status',value:'Preparing'},{fact:'run.ready',field:'status',value:'Ready'}];
  const temporary=new GitHubAdapter({providerId:'test.provider',configuration:f.config,client,historyQualifications:[]});
  await temporary.setField(projectId,journal.item.id,status.id,'single-select',go.id,randomUUID());
  await temporary.setField(projectId,journal.item.id,status.id,'single-select',wait.id,randomUUID());
  // GitHub may expose the timeline asynchronously. Read-only retries are safe.
  let probe;
  for(let n=0;n<10;n++){
    const history=await temporary.history(input.issueId,null);probe=history.events.find(event=>event.kind==='status'&&event.status===go.name&&event.actorId===input.actorId);
    if(probe)break;await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.ok(probe,'Actual actor-bearing Status qualification event is unavailable');
  const adapter=new GitHubAdapter({providerId:'test.provider',configuration:f.config,client,historyQualifications:[{schemaVersion:'1.0',scopeId:projectId,fieldId:status.id,subjectId:input.issueId,eventId:probe.id,actorId:input.actorId,optionId:go.id,status:probe.status}]});
  f.dependencies.provider=adapter;
  const compilation=await f.compile();assert.equal(compilation.ok,true,JSON.stringify(compilation.diagnostics));const compiled=compilation.configuration;
  const buildPlan=(steps,observed)=>{
    const p=planFor(f,compiled)(steps,observed);p.run.repositoryId=input.repositoryId;
    p.operation.request.source=steps[0].inputs.source;p.operation.request.requestDigest=requestDigest(p.operation.request);return p;
  };
  let now=Date.now();const clock={now:()=>new Date(now).toISOString()},dependencies={policyAuthority:localAuthority,clock};
  const audit={actorId:input.actorId,reason:'Owned W02.3 integration fixture',evidenceRefs:[`github:issue:${input.issueId}`]};
  store=startCoordinator(join(root,'state'),dependencies).store;store.activateConfiguration(compiled,null,audit,localAuthority);
  const policy=policyFor(f,compiled);policy.repositories=[{id:input.repositoryId,name:input.repository}];for(const grant of policy.grants)grant.repositoryId=input.repositoryId;
  store.applyPolicyChange({schemaVersion:'1.0',id:randomUUID(),installationId:f.config.installationId,expectedRevision:0,change:{kind:'publish',policy}},localAuthority,audit);
  const workerOptions={compiled,adapter,buildPlan};let worker=createGitHubWorker(store,workerOptions);
  const count=()=>{const db=new DatabaseSync(join(root,'state/state.sqlite'));try{return Object.fromEntries(['requests','runs','workspaces','operations','outbox'].map(table=>[table,Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n)]));}finally{db.close();}};
  await worker.tick();assert.equal(count().runs,0);assert.equal(store.githubStatus(worker.keys[0]).lastError,null);receipt.checks.push('historical-bootstrap-inert');
  // Rename both the field and options while retaining their IDs.
  const renamed=options.map(option=>({...option,name:option.id===go.id?'Execute probe':option.id===wait.id?'Backlog probe':option.name}));
  await mutate('rename-owned-field-and-options','mutation($input:UpdateProjectV2FieldInput!){updateProjectV2Field(input:$input){projectV2Field{... on ProjectV2SingleSelectField{id options{id name}}}}}',
    {input:{fieldId:status.id,name:'W02.3 request',singleSelectOptions:renamed}});
  const renameRead=await adapter.describeField(f.config.fields.request,'secret:project');assert.deepEqual(new Set(renameRead.optionIds),new Set(options.map(option=>option.id)));
  await adapter.setField(projectId,journal.item.id,status.id,'single-select',go.id,randomUUID());
  // Deliberately omit webhook delivery, then recover from current polling.
  for(let n=0;n<10&&count().runs===0;n++){
    now+=16000;await Promise.all([worker.tick(),worker.tick()]);
    if(!count().runs)await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.deepEqual(count(),{requests:1,runs:1,workspaces:1,operations:1,outbox:1});receipt.checks.push('missed-start-recovered-once','renamed-field-and-option-IDs-retained');
  const run=store.get('run','run-example-001');receipt.runId=run.id;receipt.generation=store.get('request',run.requestId).generation;
  const projectionWorker=()=>createObservationWorker(store,{sessions:new Map(),projections:new Map([[adapter.providerId,adapter.projection(store)]])});
  adapter.beginTick();await projectionWorker().tick();assert.equal(store.projectionDiagnostics()[0].state,'done');
  const projected=await adapter.item(journal.item.id);assert.equal(projected.fields.status.value,'Queued');assert.equal(projected.fields.request.value,go.id);
  receipt.checks.push('technical-field-only-write-confirmed');
  // One acknowledged mutation whose response is deliberately discarded before
  // the coordinator can persist it. Reopen and re-observe; do not resend.
  let current=store.get('run',run.id);store.commit([{record:{...current,state:'preparing',revision:current.revision+1},expectedRevision:current.revision}],audit);
  const fresh=await adapter.item(journal.item.id);const [lostId]=store.enqueueGitHubProgress(run.id,'run.preparing',fresh);
  const setField=adapter.setField.bind(adapter);let mutationCalls=0;
  // withConfiguration shares the same client, so fault injection belongs to
  // the HTTP boundary rather than a replaceable adapter instance.
  const queryOriginal=client.query.bind(client);let drop=true;
  client.query=async(...args)=>{const data=await queryOriginal(...args);if(drop&&args[0].includes('mutation LabstrideProjection')){mutationCalls++;drop=false;throw Error('Deliberately lost live mutation response');}return data;};
  adapter.beginTick();await projectionWorker().tick();assert.equal(store.delivery(`projection:${lostId}`).state,'reconcile');
  store.close();store=startCoordinator(join(root,'state'),dependencies).store;now+=120000;worker=createGitHubWorker(store,workerOptions);
  adapter.beginTick();await projectionWorker().tick();assert.equal(mutationCalls,1);assert.equal(store.delivery(`projection:${lostId}`).state,'reconcile');assert.equal((await adapter.item(journal.item.id)).fields.status.value,'Preparing');
  receipt.checks.push('lost-live-write-response-retained-without-replay');receipt.uncertainProjectionId=lostId;
  // An independent observer state records a human edit before a new projection.
  // The prior uncertain attempt remains fenced; no warning-clear bypass exists.
  current=store.get('run',run.id);store.commit([{record:{...current,state:'ready',revision:current.revision+1},expectedRevision:current.revision}],audit);
  const beforeHuman=await adapter.item(journal.item.id);const [conflictId]=store.enqueueGitHubProgress(run.id,'run.ready',beforeHuman);
  client.query=queryOriginal;await setField(projectId,journal.item.id,journal.field.id,'string','Operator override',randomUUID());
  now+=120000;adapter.beginTick();await projectionWorker().tick();assert.equal(store.delivery(`projection:${conflictId}`).state,'conflict');
  assert.equal((await adapter.item(journal.item.id)).fields.status.value,'Operator override');receipt.checks.push('concurrent-human-change-preserved-and-conflict-visible');
  now+=16000;await worker.tick();assert.equal(count().runs,1);receipt.checks.push('own-projection-and-restart-do-not-retrigger');
  receipt.counts=count();receipt.projections=store.projectionDiagnostics();receipt.actorQualificationEventId=probe.id;
  journal.checks=receipt.checks;save();
}catch(error){
  receipt.failure={code:error.code??'probe_failed',message:error.message};
  console.error(error);throw error;
}finally{
  store?.close();
  // Deleting the newly created Project removes only this probe's fields and
  // membership. Never remove an existing Project or unrelated item to clean up.
  if(journal.project){
    journal.cleanupIntent={projectId:journal.project.id};save();
    await query('mutation($input:DeleteProjectV2Input!){deleteProjectV2(input:$input){clientMutationId}}',{input:{projectId:journal.project.id}});
    // A deleted node may return NOT_FOUND plus partial GraphQL data. Verify
    // absence by complete owner enumeration instead of consuming partial data.
    let after=null,found=false;
    do{
      const checked=await query('query($id:ID!,$after:String){node(id:$id){... on User{projectsV2(first:100,after:$after){nodes{id} pageInfo{hasNextPage endCursor}}}}}',{id:input.ownerId,after});
      const connection=object(object(checked.node).projectsV2);found ||= nodes(connection.nodes).some(project=>project.id===journal.project.id);
      const page=object(connection.pageInfo);after=page.hasNextPage?page.endCursor:null;
    }while(after);
    assert.equal(found,false);
    journal.cleanupVerified=true;save();
  }
  receipt.cleanupVerified=journal.cleanupVerified;
  writeFileSync(join(root,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({root,journalPath,receiptPath:join(root,'receipt.json'),checks:receipt.checks,cleanupVerified:journal.cleanupVerified}));
}
