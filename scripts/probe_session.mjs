// Explicit enrollment of an operator-selected existing session. Never provisions a target or starts a daemon.
import { readFileSync } from 'node:fs';
import { startExecution } from '../apps/coordinator/runtime.ts';
import { readLock,freezeProfile } from '../packages/extensions/loader.ts';
import { digest,requestDigest } from '../packages/storage-sqlite/execution.ts';
import { bindCommand } from '../packages/core/sessions.ts';
import { validated } from '../packages/storage-sqlite/validation.ts';

const [configurationPath,phase='start']=process.argv.slice(2);
if (!configurationPath || !['start','recover','resume','observe'].includes(phase)) throw new Error('Usage: node scripts/probe_session.mjs CONFIG [start|recover|resume|observe]');
const config=validated('session-probe',JSON.parse(readFileSync(configurationPath,'utf8')));
const host={protocol:{major:1,minor:0},capabilities:[],permissions:['session.manage','filesystem.workspace']};
const lock=readLock(config.lockFile),pin=lock.extensions.find(p=>p.id===config.providerId);
if(!pin)throw new Error('configuration_invalid');
const id=suffix=>`${config.probeId}:${suffix}`,context={actorId:config.actorId,reason:'Explicit existing-session continuity probe',evidenceRefs:[`probe:${config.probeId}`]};
const record=(kind,identity,fields)=>({schemaVersion:'1.0',kind,id:identity,revision:1,createdAt:config.createdAt,updatedAt:config.createdAt,...fields});
const profile=freezeProfile(id('run'),digest(lock),pin,host);
const runtime=startExecution(config.dataDir,{actions:{executorId:'session-probe',nextAttempt:()=>crypto.randomUUID(),adapters:new Map()},
  observations:{sessions:new Map(),projections:new Map()},installedSessions:{host,providerIds:[pin.id]}});
try {
  const store=runtime.store;
  if(phase==='start') {
    const installation=record('installation',id('installation'),{configRevision:profile.configRevision});
    try{const old=store.get('installation',installation.id);if(old.configRevision!==installation.configRevision)throw new Error('identity_mismatch');}
    catch(error){if(error.code!=='not_found')throw error;store.commit([{record:installation,expectedRevision:null}],context);}
    const request=record('request',id('request'),{installationId:installation.id,providerId:'operator-session-probe',issueId:config.issueId,generation:1});
    const run=record('run',id('run'),{requestId:request.id,repositoryId:config.source.repositoryId,configRevision:profile.configRevision,state:'queued',paused:false,checkpoint:null});
    const workspace=record('workspace',config.workspace.id,{runId:run.id,targetId:config.workspace.targetId,locator:config.workspace.locator,branch:config.workspace.branch,ownershipRef:config.workspace.ownershipRef,localPath:null,state:'requested',keep:true});
    const sessionRequest={schemaVersion:'1.0',operationId:id('start'),workspaceId:workspace.id,providerId:pin.id,command:'start',sessionId:null,expectedLastTurnId:null,expectedHumanActivityRevision:0,input:{}};
    const command={schemaVersion:'1.0',enrollmentId:id('enrollment'),backendIdentity:config.backendIdentity,profileDigest:digest(profile),request:sessionRequest};
    let operation=record('operation',sessionRequest.operationId,{runId:run.id,workspaceId:workspace.id,state:'prepared',effectBoundary:'not_crossed',request:{schemaVersion:'1.0',operationId:sessionRequest.operationId,runId:run.id,workspaceId:workspace.id,actionId:'labstride.session-command',actionVersion:'1.0.0',configDigest:profile.configRevision,requestDigest:'0'.repeat(64),source:config.source,targetId:workspace.targetId,deadline:'2099-01-01T00:00:00Z',inputs:{}}});
    operation=bindCommand(operation,command);operation.request.requestDigest=requestDigest(operation.request);
    const outbox=record('outbox',id('outbox:start'),{runId:run.id,operationId:operation.id,intentKey:id('intent:start'),payload:{schemaVersion:'1.0',operationId:operation.id}});
    const input={schemaVersion:'1.0',stream:'operator-probes',checkpoint:null,event:{schemaVersion:'1.0',eventId:id('event'),installationId:installation.id,provider:'operator-session-probe',externalId:id('event'),subjectId:config.issueId,actorId:config.actorId,kind:'start.requested',origin:'human',occurredAt:config.createdAt,observedAt:config.createdAt,sourceVersion:profile.configRevision,facts:{generation:1}}};
    store.scheduleStart(store.receive(input).id,{request,run,workspace,operation,outbox,projections:[],resourceKey:`session:${config.backendIdentity}:${pin.configuration.sessionId??config.workspace.id}`},context);
    store.pinProfile(profile,context);store.registerSessionCommand(operation.id,command,context);
  } else if(phase==='resume'||phase==='observe') {
    const session=store.get('session',id('enrollment')),original=store.get('operation',id('start'));
    // One durable probe operation per phase. Re-running the command observes its original result.
    const command={...store.command(original.id),request:{...store.command(original.id).request,command:phase,
      operationId:id(phase),sessionId:session.sessionId,expectedLastTurnId:session.lastTurnId,expectedHumanActivityRevision:session.humanActivityRevision}};
    let operation={...original,id:id(phase),revision:1,state:'prepared',effectBoundary:'not_crossed',request:{...original.request,operationId:id(phase)}};
    operation=bindCommand(operation,command);operation.request.requestDigest=requestDigest(operation.request);
    const outbox=record('outbox',id(`outbox:${phase}`),{runId:session.runId,operationId:operation.id,intentKey:id(`intent:${phase}`),payload:{schemaVersion:'1.0',operationId:operation.id}});
    store.scheduleOperation({operation,outbox,resourceKey:`session:${session.id}`},context);store.registerSessionCommand(operation.id,command,context);
  }
  await runtime.tick();await runtime.drain();
  const status=store.controlStatus(id('run'));
  console.log(JSON.stringify({schemaVersion:'1.0',probeId:config.probeId,runId:id('run'),workspaceId:config.workspace.id,
    operations:status.operations.map(op=>({operationId:op.operationId,state:op.state,error:op.delivery?.lastError})),
    atomicGuards:profile.capabilities.includes('session.atomic-guards.v1'),liveAcceptance:'not_verified'}));
  if(status.operations.some(op=>op.state!=='succeeded'))process.exitCode=1;
} catch(error) {
  console.error(JSON.stringify({schemaVersion:'1.0',error:['unsupported_capability','stale_revision','identity_conflict','invalid_payload'].includes(error.code)?error.code:'probe_incomplete',liveAcceptance:'not_verified'}));process.exitCode=1;
} finally {await runtime.close();}
