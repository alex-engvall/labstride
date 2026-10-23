// Owned live verification only. This is bounded trusted composition, not W04's
// workflow runner, a listener, or an authority source for issue/hook content.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {remoteGitHubTransport} from './transport.mjs';
import {GitHubClient,object,nodes} from '../../packages/provider-github/client.ts';
import {GitHubAdapter} from '../../packages/provider-github/adapter.ts';
import {configurationFixture,localAuthority,policyFor} from '../../tests/helpers/configuration-fixture.mjs';
import {startCoordinator} from '../../apps/coordinator/main.ts';
import {createGitHubWorker} from '../../packages/core/github-worker.ts';
import {createWorker,actionKey} from '../../packages/core/worker.ts';
import {createObservationWorker} from '../../packages/core/observation-worker.ts';
import {configuredWorkspaceAction,prepareWorkspaceStart} from '../../packages/connector-ssh/workspaces.ts';
import {digest,requestDigest} from '../../packages/storage-sqlite/execution.ts';
import {validated} from '../../packages/storage-sqlite/validation.ts';
import {freezeProfile} from '../../packages/extensions/loader.ts';
import {installedSessionAction} from '../../packages/extensions/session-action.ts';
import {sessionResolver} from '../../packages/extensions/session-provider.ts';
import {bindCommand,sessionAction,sessionActionVersion} from '../../packages/core/sessions.ts';
import {pinnedSessionObserver} from '../../packages/core/session-runtime.ts';
import {readProtected} from '../../packages/target-helper/filesystem.ts';
process.umask(0o077);
const spec=validated('workspace-continuity-probe',JSON.parse(readProtected(process.argv[2]).toString('utf8'))),phase=process.argv[3];
assert.equal(spec.schemaVersion,'1.0');assert.ok(['prepare','execute','recover','status','enroll','before-human','after-human','cleanup-project'].includes(phase));
assert.ok(spec.stateDirectory.startsWith('/'));assert.ok(Array.isArray(spec.issueIds)&&spec.issueIds.length===2);
const transport=remoteGitHubTransport(),root=spec.stateDirectory;
const journalPath=join(root,'journal.json');
let journal=existsSync(journalPath)?JSON.parse(readProtected(journalPath).toString('utf8')):{schemaVersion:'1.0',checks:[],intent:null,fixtureId:randomUUID(),specDigest:digest(spec)};
assert.equal(journal.specDigest,digest(spec),'Original continuity descriptor changed');
const save=()=>writeFileSync(journalPath,JSON.stringify(journal,null,2)+'\n',{mode:0o600});
const client=new GitHubClient({credential:async()=> 'authenticated-stdio-bridge',fetch:transport.fetch,requestsPerTick:1000,timeoutMs:30000});
const query=(q,v={})=>client.query(q,v,'secret:project');
async function fixtureEffect(key,invoke){
  journal.effects??={};const old=journal.effects[key];
  if(old){assert.equal(old.state,'complete','Uncertain owned fixture effect requires inspection');return old.result;}
  journal.effects[key]={state:'unknown'};save();const result=await invoke();journal.effects[key]={state:'complete',result:result??null};save();return result;
}
async function mutate(kind,q,variables){return fixtureEffect(kind==='add-owned-issue'?kind+':'+variables.input.contentId:kind,()=>query(q,variables));}
async function setOwned(adapter,key,itemId,value){return fixtureEffect(key,()=>adapter.setField(journal.project.id,itemId,journal.status.id,'single-select',value,key));}
const identity=await query('query($owner:String!,$repo:String!){viewer{id login} repository(owner:$owner,name:$repo){id nameWithOwner defaultBranchRef{target{oid}}}}',{owner:spec.repository.split('/')[0],repo:spec.repository.split('/')[1]});
assert.equal(identity.viewer.id,spec.actorId);assert.equal(identity.repository.nameWithOwner,spec.repository);
assert.equal(identity.repository.id,spec.repositoryId);
let store;
try {
  if(phase==='cleanup-project') {
    assert.ok(journal.project&&journal.started,'Only the recorded owned fixture can be removed');
    const check=await query('query($id:ID!){node(id:$id){... on ProjectV2{id title}}}',{id:journal.project.id});
    if(check.node){
      assert.equal(check.node.title,'Labstride W03.2 continuity '+journal.fixtureId);
      await mutate('delete-owned-project','mutation($input:DeleteProjectV2Input!){deleteProjectV2(input:$input){clientMutationId}}',{input:{projectId:journal.project.id}});
    }
    const absent=await query('query($id:ID!){node(id:$id){id}}',{id:journal.project.id});assert.equal(absent.node,null);
    journal.projectRemoved=true;save();transport.emit({kind:'result',phase,removedOwnedProject:true,workspacesRetained:true});
  } else {
  assert.equal(journal.projectRemoved,undefined,'The owned Project was already removed');
  if(phase==='prepare'&&!journal.project){
    const response=await mutate('create-owned-project','mutation($input:CreateProjectV2Input!){createProjectV2(input:$input){projectV2{id number url}}}',{input:{ownerId:spec.actorId,title:'Labstride W03.2 continuity '+journal.fixtureId}});
    journal.project=response.createProjectV2.projectV2;save();
  }
  assert.ok(journal.project,'prepare must create the owned fixture first');
  if(phase==='prepare'&&!journal.status){
    const response=await query('query($id:ID!){node(id:$id){... on ProjectV2{fields(first:100){nodes{... on ProjectV2SingleSelectField{id name options{id name}}}}}}}',{id:journal.project.id});
    journal.status=nodes(response.node.fields.nodes).find(field=>field.name==='Status');assert.ok(journal.status);save();
  }
  if(phase==='prepare'&&!journal.progress){
    const response=await mutate('create-owned-progress','mutation($input:CreateProjectV2FieldInput!){createProjectV2Field(input:$input){projectV2Field{... on ProjectV2Field{id name}}}}',{input:{projectId:journal.project.id,dataType:'TEXT',name:'W03.2 technical progress'}});
    journal.progress=response.createProjectV2Field.projectV2Field;save();
  }
  journal.items??=[];
  if(phase==='prepare')for(const issueId of spec.issueIds){
    if(journal.items.some(item=>item.issueId===issueId))continue;
    const response=await mutate('add-owned-issue','mutation($input:AddProjectV2ItemByIdInput!){addProjectV2ItemById(input:$input){item{id}}}',{input:{projectId:journal.project.id,contentId:issueId}});
    journal.items.push({issueId,id:response.addProjectV2ItemById.item.id});save();
  }
  mkdirSync(join(root,'compilation'),{recursive:true,mode:0o700});
  const f=configurationFixture(join(root,'compilation'));f.config.installationId=spec.installationId;
  const options=journal.status.options,wait=options[0],go=options[1];assert.ok(wait&&go);
  Object.assign(f.config.github,{repositories:[spec.repository],actorIds:[spec.actorId],pollIntervalSeconds:15});
  f.config.broker.url='https://api.github.com';
  f.config.fields={request:{source:'project_v2',scopeId:journal.project.id,fieldId:journal.status.id,type:'single-select',options:Object.fromEntries(options.map(option=>[option.id===go.id?'go':option.id===wait.id?'wait':option.id,option.id]))},
    status:{source:'project_v2',scopeId:journal.project.id,fieldId:journal.progress.id,type:'string'}};
  f.config.controls={};f.config.projections=[{fact:'run.queued',field:'status',value:'Queued'},{fact:'run.preparing',field:'status',value:'Preparing'},{fact:'run.ready',field:'status',value:'Ready'}];
  const bootstrap=new GitHubAdapter({providerId:'test.provider',configuration:f.config,client,historyQualifications:[]});
  if(phase==='prepare'&&!journal.qualification){
    await setOwned(bootstrap,'qualification-go',journal.items[0].id,go.id);
    for(const item of journal.items)await setOwned(bootstrap,'qualification-wait:'+item.id,item.id,wait.id);
    for(let n=0;n<15;n++){
      const history=await bootstrap.history(spec.issueIds[0],null);const event=history.events.find(event=>event.kind==='status'&&event.status===go.name&&event.actorId===spec.actorId);
      if(event){journal.qualification={schemaVersion:'1.0',scopeId:journal.project.id,fieldId:journal.status.id,subjectId:spec.issueIds[0],eventId:event.id,actorId:spec.actorId,optionId:go.id,status:go.name};save();break;}
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
  }
  assert.ok(journal.qualification,'Actual actor-bearing history event is required');
  const adapter=new GitHubAdapter({providerId:'test.provider',configuration:f.config,client,historyQualifications:[journal.qualification]});
  f.dependencies.provider=adapter;
  const host=f.dependencies.host;host.permissions.push('session.manage');
  const connector=spec.connectorPin,action=spec.actionPin;
  // The provider descriptor is the existing public compiler fixture. Runtime
  // provider reads/writes below use the actual GitHubAdapter and authenticated API.
  f.dependencies.lock.extensions=[f.dependencies.lock.extensions.find(pin=>pin.kind==='provider'),connector,action,spec.sessionActionPin];
  f.config.targets={[spec.targetId]:{connector:connector.id,configuration:connector.configuration}};
  f.config.workflows={prepare:[{id:'checkout',action:action.id,inputs:{target:spec.targetId,rootId:spec.rootId,source:'context.source'}}]};
  const compilation=await f.compile();assert.equal(compilation.ok,true,JSON.stringify(compilation.diagnostics));const compiled=compilation.configuration;
  journal.now=Math.max(journal.now??0,Date.now());
  const clock={now:()=>new Date(journal.now).toISOString()},dependencies={policyAuthority:localAuthority,clock};
  store=startCoordinator(join(root,'coordinator'),dependencies).store;
  const audit={actorId:spec.actorId,reason:'Explicitly authorized owned W03.2 live continuity fixture',evidenceRefs:spec.issueIds.map(id=>'github:issue:'+id)};
  if(!journal.activated){
    store.activateConfiguration(compiled,null,audit,localAuthority);
    f.source={repositoryId:identity.repository.id,repository:spec.repository,sha:identity.repository.defaultBranchRef.target.oid};
    const policy=policyFor(f,compiled);policy.actorIds=[spec.actorId];policy.repositories=[{id:identity.repository.id,name:spec.repository}];
    store.applyPolicyChange({schemaVersion:'1.0',id:randomUUID(),installationId:spec.installationId,expectedRevision:0,change:{kind:'publish',policy}},localAuthority,audit);
    journal.activated=true;save();
  }
  const record=(kind,id,fields)=>({schemaVersion:'1.0',kind,id,revision:1,createdAt:clock.now(),updatedAt:clock.now(),...fields});
  const buildPlan=(steps,observed)=>{
    const requestId='request:'+randomUUID(),runId='run:'+randomUUID(),workspaceId='workspace:'+randomUUID(),operationId='operation:'+randomUUID();
    const step=steps[0],source=step.inputs.source;
    const op=record('operation',operationId,{runId,workspaceId,state:'prepared',effectBoundary:'not_crossed',request:{schemaVersion:'1.0',operationId,runId,workspaceId,actionId:step.actionId,actionVersion:step.actionVersion,configDigest:compiled.snapshot.digest,requestDigest:'0'.repeat(64),source,targetId:spec.targetId,deadline:new Date(Date.now()+86400000).toISOString(),inputs:step.inputs}});op.request.requestDigest=requestDigest(op.request);
    return prepareWorkspaceStart({request:record('request',requestId,{installationId:spec.installationId,providerId:observed.event.provider,issueId:observed.event.subjectId,generation:observed.generation}),
      run:record('run',runId,{requestId,repositoryId:source.repositoryId,configRevision:compiled.snapshot.digest,state:'queued',paused:false,checkpoint:null}),
      workspace:record('workspace',workspaceId,{runId,targetId:spec.targetId,locator:'pending',localPath:null,ownershipRef:'pending',branch:'pending',state:'requested',keep:true}),operation:op,
      outbox:record('outbox','outbox:'+randomUUID(),{runId,operationId,intentKey:'workspace:'+operationId,payload:{schemaVersion:'1.0',operationId}}),projections:[],resourceKey:'workspace:'+workspaceId},spec.installationId);
  };
  const optionsWorker={compiled,adapter,buildPlan};let github=createGitHubWorker(store,optionsWorker);
  const count=()=>store.snapshot().records.filter(row=>row.kind==='run').length;
  if(phase==='prepare'&&!journal.started){
    await github.tick();assert.equal(count(),0);journal.checks.push('inert-bootstrap');
    for(const item of journal.items)await setOwned(adapter,'authorized-start:'+item.id,item.id,go.id);
    for(let n=0;n<15&&count()<2;n++){journal.now+=16000;await Promise.all([github.tick(),github.tick()]);if(count()<2)await new Promise(resolve=>setTimeout(resolve,1000));}
    assert.equal(count(),2,JSON.stringify(store.githubStatus(github.keys[0])));
    journal.runs=store.snapshot().records.filter(row=>row.kind==='run').map(run=>({runId:run.id,issueId:store.get('request',run.requestId).issueId,workspace:store.snapshot().records.find(row=>row.kind==='workspace'&&row.runId===run.id),operation:store.snapshot().records.find(row=>row.kind==='operation'&&row.runId===run.id)}));
    journal.started=true;journal.checks.push('two-actual-github-generations-admitted');save();
  }
  if(phase==='execute'||phase==='recover'){
    assert.ok(journal.started);
    // Duplicate polling/start after a new process never builds another run.
    journal.now+=120000;await Promise.all([github.tick(),github.tick()]);assert.equal(count(),2);
    if(phase==='execute'){
      await fixtureEffect('controlled-github-write-failure',async()=>{
        const before=await adapter.item(journal.items[0].id);let failure;
        try {
          // A single-select value cannot be written to this owned TEXT field.
          // This is an actual API rejection, confined to the owned test item.
          await query('mutation($input:UpdateProjectV2ItemFieldValueInput!){updateProjectV2ItemFieldValue(input:$input){clientMutationId}}',
            {input:{projectId:journal.project.id,itemId:journal.items[0].id,fieldId:journal.progress.id,value:{singleSelectOptionId:go.id}}});
        }catch(error){failure=error.code;}
        assert.equal(failure,'graphql_errors');
        const after=await adapter.item(journal.items[0].id);assert.deepEqual(after.fields.status,before.fields.status);
        return {rejected:true,fieldUnchanged:true};
      });
      journal.checks.push('actual-github-write-rejected-without-field-change');save();
      const projections=createObservationWorker(store,{sessions:new Map(),projections:new Map([[adapter.providerId,adapter.projection(store)]])});
      const original=client.query.bind(client);let dropped=false;
      client.query=async(...args)=>{const value=await original(...args);if(!dropped&&args[0].includes('mutation LabstrideProjection')){dropped=true;journal.lostProjectionToken=args[1].input.clientMutationId;save();throw Error('Deliberately lost owned GitHub write response');}return value;};
      adapter.beginTick();await projections.tick();client.query=original;assert.equal(dropped,true);journal.checks.push('actual-github-write-response-lost');save();
      const originalSpawn=childProcess.spawn;
      childProcess.spawn=(...args)=>{
        const child=originalSpawn(...args);
        if(args[0]==='/usr/bin/ssh'){
          const end=child.stdin.end.bind(child.stdin);
          child.stdin.end=(bytes,...rest)=>{let request;try{request=JSON.parse(bytes.toString());}catch{}
            if(request?.method==='create')transport.emit({kind:'ssh-client',pid:child.pid,operationId:request.operation.operationId});
            return end(bytes,...rest);};
        }
        return child;
      };syncBuiltinESMExports();
    }
    const actionAdapter=configuredWorkspaceAction(store,host);
    const worker=createWorker(store,{executorId:'continuity-probe',nextAttempt:()=>randomUUID(),maxJobs:1,adapters:new Map([[actionKey(action.id,action.version),actionAdapter]])});
    for(let n=0;n<4;n++){await worker.tick();await worker.drain();const pending=store.snapshot().records.filter(row=>row.kind==='operation'&&row.state!=='succeeded');if(phase==='execute'||!pending.length)break;}
    if(phase==='execute'){
      const unknown=store.snapshot().records.filter(row=>row.kind==='operation'&&row.state==='outcome_unknown');assert.equal(unknown.length,1);journal.continuityRunId=unknown[0].runId;journal.checks.push('actual-ssh-creation-reply-lost');save();
      transport.emit({kind:'kill-coordinator',pid:process.pid});
      // The root-owned fault runner kills only this coordinator process.
      await new Promise(()=>{});
    }
    for(const run of journal.runs){assert.equal(store.get('operation',run.operation.id).state,'succeeded');assert.equal(store.get('workspace',run.workspace.id).state,'ready');}
    const lost=store.projectionDiagnostics().filter(row=>row.uncertain);
    // Reconciliation is a read. GitHub exposes neither field CAS nor a durable
    // mutation receipt, so an unacknowledged checked write cannot be certified
    // exactly once merely because the field now equals its desired value.
    const observed=createObservationWorker(store,{sessions:new Map(),projections:new Map([[adapter.providerId,adapter.projection(store)]])});
    const original=client.query.bind(client);let replayed=0;
    client.query=async(...args)=>{if(args[0].includes('mutation LabstrideProjection')&&args[1].input.clientMutationId===journal.lostProjectionToken)replayed++;return original(...args);};
    try{adapter.beginTick();await observed.tick();}finally{client.query=original;}
    assert.ok(lost.length>0);assert.equal(replayed,0);assert.ok(store.projectionDiagnostics().some(row=>row.uncertain));
    journal.checks.push('unacknowledged-github-write-remains-uncertain-without-replay');
    journal.projectionRecovery={unknownBefore:lost.length,diagnostics:store.projectionDiagnostics()};
    journal.checks.push('coordinator-restart-retains-two-original-workspaces');save();
  }
  if(['enroll','before-human','after-human'].includes(phase)) {
    const selected=journal.runs.find(run=>run.runId===journal.continuityRunId);assert.ok(selected);
    const run=store.get('run',selected.runId),workspace=store.get('workspace',selected.workspace.id);
    assert.equal(workspace.state,'ready');
    const enrollment=validated('workspace-continuity-session',JSON.parse(readProtected(spec.sessionEnrollmentFile).toString('utf8')));
    assert.equal(enrollment.workspaceId,workspace.id);assert.equal(enrollment.backendUid,spec.codingUid);
    assert.equal(enrollment.pin.kind,'session-provider');assert.equal(enrollment.pin.configuration.workspaceId,workspace.id);
    assert.equal(enrollment.pin.configuration.workspacePath,join(spec.sourceRoot,workspace.locator,'source'));
    const profile=freezeProfile(run.id,run.configRevision,enrollment.pin,host);
    store.pinProfile(profile,audit);
    const resolver=sessionResolver(host),actionAdapter=installedSessionAction(store,host,resolver.resolve);
    const worker=()=>createWorker(store,{executorId:'continuity-session',nextAttempt:()=>randomUUID(),adapters:new Map([[actionKey(sessionAction,sessionActionVersion),actionAdapter]])});
    const enrollmentId='session:'+run.id;
    const original=store.get('operation',selected.operation.id);
    function schedule(name,command) {
      const operationId=name+':'+run.id;
      try{store.get('operation',operationId);store.registerSessionCommand(operationId,store.command(operationId),audit);return operationId;}catch(error){assert.equal(error.code,'not_found');}
      let session=null;try{session=store.get('session',enrollmentId);}catch(error){assert.equal(error.code,'not_found');}
      const descriptor={schemaVersion:'1.0',enrollmentId,backendIdentity:profile.pin.configuration.backendIdentity,profileDigest:digest(profile),
        request:{schemaVersion:'1.0',operationId,workspaceId:workspace.id,providerId:profile.pin.id,command,sessionId:command==='start'?null:session.sessionId,
          expectedLastTurnId:session?.lastTurnId??null,expectedHumanActivityRevision:session?.humanActivityRevision??0,input:{}}};
      let operation=record('operation',operationId,{runId:run.id,workspaceId:workspace.id,state:'prepared',effectBoundary:'not_crossed',request:{...original.request,operationId}});
      operation=bindCommand(operation,descriptor);operation.request.requestDigest=requestDigest(operation.request);
      const automation=command==='send'?{schemaVersion:'1.0',sessionGuard:{enrollmentId,sessionId:session.sessionId,expectedLastTurnId:session.lastTurnId,expectedHumanActivityRevision:session.humanActivityRevision}}:undefined;
      store.scheduleOperation({operation,outbox:record('outbox','outbox:'+operationId,{runId:run.id,operationId,intentKey:operationId,payload:{schemaVersion:'1.0',operationId}}),resourceKey:'session:'+enrollmentId,...(automation?{automation}:{})},audit);
      store.registerSessionCommand(operationId,descriptor,audit);return operationId;
    }
    try {
      if(phase==='enroll') {
        const id=schedule('enroll','start');let actions=worker();await actions.tick();await actions.drain();assert.equal(store.get('operation',id).state,'succeeded');
        const resume=schedule('resume','resume');actions=worker();await actions.tick();await actions.drain();assert.equal(store.get('operation',resume).state,'succeeded');
        journal.session={enrollmentId,profileDigest:digest(profile),sessionId:store.get('session',enrollmentId).sessionId};
        journal.checks.push('actual-coding-client-enrolled-and-same-session-resumed');save();
      }
      if(phase==='before-human') {
        assert.ok(journal.session);const id=schedule('unsupported-send','send');const actions=worker();await actions.tick();await actions.drain();
        assert.equal(store.delivery('operation:'+id).lastError,'unsupported_capability');assert.equal(store.get('operation',id).effectBoundary,'not_crossed');
        const session=store.get('session',enrollmentId);journal.beforeHuman??={lastTurnId:session.lastTurnId,revision:session.humanActivityRevision,operationId:id};
        journal.checks.push('missing-atomic-guard-blocked-before-effect');save();
      }
      if(phase==='after-human') {
        assert.ok(journal.beforeHuman);
        journal.now+=120000;await createObservationWorker(store,{sessions:new Map([[profile.pin.id,pinnedSessionObserver(store,resolver.resolve)]]),projections:new Map()}).tick();
        const session=store.get('session',enrollmentId),op=store.get('operation',journal.beforeHuman.operationId);
        assert.notEqual(session.lastTurnId,journal.beforeHuman.lastTurnId);assert.ok(session.humanActivityRevision>journal.beforeHuman.revision);
        let rejected;try{store.claim(op.id,'stale-continuation-check',randomUUID());}catch(error){rejected=error.code;}
        assert.equal(rejected,'stale_revision');const adapter=await resolver.resolve(profile),reply=await adapter.invoke(store.command(op.id).request);
        assert.equal(reply.outcome,'error');assert.equal(reply.code,'stale_revision');assert.equal(op.effectBoundary,'not_crossed');
        assert.equal(store.binding(enrollmentId).sessionId,journal.session.sessionId);assert.equal(store.controlStatus(run.id).humanHold,true);
        journal.checks.push('actual-human-turn-retained-same-session','stale-original-continuation-rejected-before-effect');save();
      }
      transport.emit({kind:'session-result',phase,enrollmentId,session:store.get('session',enrollmentId),binding:store.binding(enrollmentId),humanHold:store.controlStatus(run.id).humanHold});
    }finally{await resolver.close();}
  }
  journal.now+=16000;save();transport.emit({kind:'result',phase,runs:journal.runs,checks:journal.checks,projections:store.projectionDiagnostics()});
  }
}catch(error){transport.emit({kind:'failure',phase,code:error.code??'probe_failed',message:String(error.message).slice(0,2000)});process.exitCode=1;}
finally{store?.close();transport.close();}
