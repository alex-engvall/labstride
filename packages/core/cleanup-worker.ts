import type { TrustedCleanupDeletionRequestV5 } from '../../contracts/generated/ssh-cleanup-delete-request.ts';
import type { CleanupPreparationV1 } from '../../contracts/generated/cleanup-preparation.ts';
import { randomUUID } from 'node:crypto';
import { digest } from '../configuration/json.ts';
import { fieldValue } from '../configuration/values.ts';
import { validated } from '../storage-sqlite/validation.ts';
import { freezeProfile, loadExtension } from '../extensions/loader.ts';
import type { HostProfile } from '../extensions/loader.ts';
import type { CleanupStore } from '../storage-sqlite/cleanup.ts';
import type { RecordOf } from './lifecycle.ts';
import type { ActionAdapter, Claim } from './execution.ts';
import type { MergeProvider, MergeInput } from './merges.ts';
import { resolveObserver, targetVerdict } from './deployments.ts';
import type { DeploymentObservers, TargetObservationRequest } from './deployments.ts';
import type { CleanupDecisionV1 } from '../../contracts/generated/cleanup-decision.ts';
import type { CleanupInspectionV1 } from '../../contracts/generated/cleanup-inspection.ts';
import type { TrustedCleanupInspectionRequestV4 } from '../../contracts/generated/ssh-cleanup-request.ts';
export type CleanupContext = ReturnType<CleanupStore['cleanupContext']>;
export interface CleanupOptions {
  host: HostProfile;
  inspect(request: TrustedCleanupInspectionRequestV4, context: CleanupContext): Promise<unknown>;
  deleteTarget?(request: TrustedCleanupDeletionRequestV5, context: CleanupContext): Promise<unknown>;
  mergeProvider?: MergeProvider;
  observers?: DeploymentObservers;
  // These ports perform independent reads, with identities validated below.
  keepItem?(context: CleanupContext): Promise<unknown>;
  session?(session: RecordOf<'session'>): Promise<unknown>;
  managedSession?(context: CleanupContext): Promise<unknown>;
}
export function createCleanupWorker(store: CleanupStore, options: CleanupOptions) {
  let running = false;
  const nextRead = new Map<string, number>();
  const fresh = (time: string) => { const age = Date.parse(store.cleanupNow()) - Date.parse(time); return age >= 0 && age <= 30000; };
  async function read<T>(work:Promise<T>,ms=15000):Promise<T>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([work,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('observation_timeout')),ms);})]);}
    finally{clearTimeout(timer);}
  }
  async function assess(requestId: string, preparation?: CleanupPreparationV1): Promise<CleanupDecisionV1> {
    if (!preparation && store.cleanupExecution(requestId)) {
      await executeDeletion(requestId);
      return store.cleanupDecision(requestId)!.decision;
    }
    let context = store.cleanupContext(requestId);
    const snapshot = store.runConfiguration(context.run.id)!;
    const blockers = store.cleanupLocalBlockers(context), evidenceRefs: string[] = [];
    const add = (code: string) => { if (!blockers.includes(code)) blockers.push(code); };
    const observedAt = store.cleanupNow();
    let inspection: CleanupInspectionV1 | null = null;
    const observations: CleanupDecisionV1['observations']={merge:null,targets:[],sessions:[],managed:null,keep:null};
    const merge = context.merges.filter(m => m.record?.outcome === 'confirmed').at(-1);
    if (merge?.record) try {
      if (!options.mergeProvider) throw Error();
      const op = context.operations.find(op => op.id === merge.operationId)!.request;
      const input = validated('merge-input', op.inputs as unknown as MergeInput);
      const actual = await read(options.mergeProvider.observe(merge.record.enrollment, input));
      if (actual.repositoryId !== context.run.repositoryId || actual.pullRequest !== input.pullRequest || actual.head !== input.expectedHead ||
        actual.baseBranch !== merge.record.enrollment.baseBranch || !actual.merged || actual.mergeSha !== merge.record.mergeSha) throw Error();
      observations.merge=actual;
      evidenceRefs.push(`merge:${digest(merge.record)}`);
    } catch { add('merge_observation_unknown'); }
    for (const deployment of context.deployments) {
      const current = deployment.target?.current;
      if (!current || !deployment.enrollment.deployment) continue;
      try {
        const op = store.get('operation', current.operationId).request, enrollment = store.workflowEnrollment(op.operationId), profile = enrollment.deployment!;
        const observer = resolveObserver(profile, options.observers ?? new Map()); await observer.validate(profile.observer.configuration);
        const probe: TargetObservationRequest = { schemaVersion: '1.0', observationId: randomUUID(), targetId: enrollment.targetId,
          environment: enrollment.environment, configuration: profile.observer.configuration };
        const signal = AbortSignal.timeout(profile.observationTimeoutMs ?? 15000);
        const target = validated('target-observation', await read(observer.observe(probe, signal),profile.observationTimeoutMs ?? 15000) as import('../../contracts/generated/target-observation.ts').IndependentTargetObservationV1);
        if (targetVerdict(probe, target, profile, op.source, store.cleanupNow()).status !== 'verified' || target.resourceId !== current.evidence.target?.resourceId) throw Error();
        observations.targets.push(target);
        evidenceRefs.push(`target:${digest(target)}`, `deployment:${current.evidenceId}`);
      } catch { add('target_observation_unknown'); }
    }
    // Safe local blockers avoid expensive target work, but never fabricate a
    // clean inspection or authorize an action from a cached observation.
    if (!blockers.length) try {
      const receipt = store.workspaceReceipt(context.run.id), target = snapshot.configuration.targets[context.workspace.targetId];
      const request: TrustedCleanupInspectionRequestV4 = { schemaVersion: '4.0', requestId, method: 'inspect',
        installationId: context.request.installationId, targetId: context.workspace.targetId, targetRevision: target.configuration.revision as number,
        workspaceId: context.workspace.id, creationOperationId: receipt.operationId, receiptDigest: digest(receipt), policy: context.policy };
      const reply = preparation ? {schemaVersion:'4.0' as const,requestId:request.requestId,installationId:request.installationId,targetId:request.targetId,targetRevision:request.targetRevision,
        method:'inspect' as const,outcome:'ok' as const,inspection:preparation.inspection} :
        validated('ssh-cleanup-response', await read(options.inspect(request, context),60000) as import('../../contracts/generated/ssh-cleanup-response.ts').TrustedCleanupInspectionResponseV4);
      for (const key of ['requestId', 'installationId', 'targetId', 'targetRevision', 'method'] as const) if (reply[key] !== request[key]) throw Error();
      inspection = reply.inspection;
      if (reply.outcome !== 'ok' || !inspection || inspection.requestId !== (preparation?.operationId ?? requestId) || inspection.installationId !== request.installationId ||
        inspection.targetId !== request.targetId || inspection.workspaceId !== request.workspaceId || inspection.creationOperationId !== request.creationOperationId ||
        inspection.receiptDigest !== request.receiptDigest || inspection.policyDigest !== digest(context.policy) || !fresh(inspection.observedAt)) throw Error();
      for (const blocker of inspection.blockers) add(blocker);
      if (!inspection.remoteRefsDigest) add('remote_preservation_unknown');
      if (inspection.counts.tracked) add('tracked_changes');
      if (inspection.counts.untracked) add('untracked_work');
      if (inspection.counts.ignored) add('undeclared_ignored_work');
      if (inspection.counts.unpushed) add('unpushed_commits');
      evidenceRefs.push(`inspection:${digest(inspection)}`);
    } catch { inspection = null; add('target_inspection_unknown'); }
    // Read controls and every session after the potentially slow Git inspection.
    const control = snapshot.configuration.controls.keep;
    if (control) try {
      if (!options.keepItem) throw Error();
      const item = validated('github-item', await read(options.keepItem(context)) as import('../../contracts/generated/github-item.ts').GitHubItemSnapshot);
      const binding = snapshot.bindings[control.field], field = snapshot.configuration.fields[control.field], value = item.fields[control.field];
      if (item.subjectId !== context.request.issueId || item.repositoryId !== context.run.repositoryId || item.scopeId !== binding.scopeId || !value?.present) throw Error();
      const actual = digest(value.value);
      if (control.enabledValues.some(v => digest(fieldValue(field, v, true)) === actual)) add('remote_keep');
      else if (!control.disabledValues.some(v => digest(fieldValue(field, v, true)) === actual)) throw Error();
      observations.keep={bindingDigest:digest(binding),retained:blockers.includes('remote_keep'),observedAt:store.cleanupNow()};
      evidenceRefs.push(`keep:${digest(item)}`);
    } catch { add('remote_keep_unknown'); }
    for (const record of context.sessions) if (record.kind === 'session') try {
      if (!options.session) throw Error();
      const observation = validated('session-observation', await read(options.session(record)) as import('./observations.ts').SessionObservation);
      if (observation.workspaceId !== record.workspaceId || observation.providerId !== record.providerId || observation.sessionId !== record.sessionId ||
        observation.humanActivityRevision !== record.humanActivityRevision || observation.lastTurnId !== record.lastTurnId ||
        !['ready', 'closed'].includes(observation.state)) throw Error();
      observations.sessions.push(observation);
      evidenceRefs.push(`session:${digest(observation)}`);
    } catch { add('session_observation_unknown'); }
    if (context.managed) try {
      if (!options.managedSession) throw Error();
      const observed = validated('managed-cleanup-observation', await read(options.managedSession(context)) as import('../../contracts/generated/managed-cleanup-observation.ts').ManagedCleanupObservationV1);
      if (observed.runId !== context.run.id || observed.workspaceId !== context.workspace.id || observed.sessionId !== context.managed.sessionId ||
        observed.path !== context.managed.path || observed.state !== 'idle' || !fresh(observed.observedAt)) throw Error();
      observations.managed=observed;
      evidenceRefs.push(`managed-session:${digest(observed)}`);
    } catch { add('managed_session_unknown'); }
    if (!fresh(observedAt)) add('assessment_stale');
    const current = store.cleanupContext(requestId);
    if (current.contextDigest !== context.contextDigest) { context = current; add('state_changed'); }
    const decision: CleanupDecisionV1 = { schemaVersion: '1.0', requestId, contextDigest: context.contextDigest, policyDigest: digest(context.policy),
      recoveryEpoch: context.recoveryEpoch, observedAt, eligible: blockers.length === 0, blockers, evidenceRefs, inspection, observations };
    const decisionId = store.recordCleanupDecision(context, decision);
    if (!decision.eligible || preparation) return decision;
    const prior = store.cleanupRequests().find(r => r.id === requestId)!;
    if (prior.operation && prior.state !== 'outcome_unknown') {
      if(prior.state==='pending_executor')await executeDeletion(requestId);
      return decision;
    }
    const pin = snapshot.extensionLock.extensions.find(pin => pin.id === context.policy.actionId && pin.version === context.policy.actionVersion && pin.kind === 'action');
    if (!pin?.capabilities.includes('cleanup.assess.v1')) throw Error('unsupported_capability');
    const loaded = await loadExtension(freezeProfile(context.run.id, snapshot.digest, pin, options.host), options.host);
    const adapter = loaded.instance as ActionAdapter;
    if (typeof adapter.validate !== 'function' || typeof adapter.start !== 'function' || typeof adapter.reconcile !== 'function') throw Error('unsupported_capability');
    // Loading/validation can await. Recheck the durable decision at the last
    // boundary and preserve any possible invocation before crossing it.
    const template = prior.operation ?? store.previewCleanupAssessment(requestId,decisionId);
    loaded.checkInput(template.inputs); await adapter.validate(template);
    const operation = prior.operation ?? store.beginCleanupAssessment(requestId, decisionId, template);
    try {
      const result = prior.operation ? await adapter.reconcile(operation, operation.operationId) : await adapter.start(operation,
        validated<Claim>('execution-record',{ schemaVersion:'1.0',kind:'claim',id:operation.operationId,operationId:operation.operationId,attemptId:operation.operationId,executorId:'cleanup-assessment',resourceKey:`cleanup:${operation.workspaceId}`,requestDigest:operation.requestDigest,fencingNumber:1,createdAt:store.cleanupNow() }));
      loaded.checkOutput(result); store.finishCleanupAssessment(requestId, result);
    } catch { /* The durable possible invocation stays unknown. Never start again. */ }
    if(store.cleanupRequests().find(r=>r.id===requestId)?.state==='pending_executor')await executeDeletion(requestId);
    return decision;
  }
  async function executeDeletion(requestId: string): Promise<void> {
    let context=store.cleanupContext(requestId), saved=store.cleanupExecution(requestId);
    if(saved && ['deleted','blocked','released'].includes(saved.stage))return;
    const snapshot=store.runConfiguration(context.run.id)!, pin=snapshot.extensionLock.extensions.find(p=>p.id===context.policy.actionId&&p.version===context.policy.actionVersion);
    if(!pin?.capabilities.includes('cleanup.execute.v1') || !options.deleteTarget)return;
    const services={target:{
      async binding(operation:RecordOf<'operation'>['request']) {
        const original=store.cleanupExecution(requestId)?.operation;
        if(!original || digest(original)!==digest(operation))throw Error('identity_mismatch');
        return {installationId:context.request.installationId,revision:snapshot.configuration.targets[operation.targetId].configuration.revision};
      },
      async invoke(request:TrustedCleanupDeletionRequestV5) {
        validated('ssh-cleanup-delete-request',request);
        const execution=store.cleanupExecution(requestId);
        if(!execution || digest(execution.operation)!==digest(request.operation) || request.installationId!==context.request.installationId ||
          request.targetId!==execution.operation.targetId || request.targetRevision!==snapshot.configuration.targets[request.targetId].configuration.revision ||
          request.method==='commit'&&(execution.stage!=='committing'||digest(execution.authorization)!==digest(request.authorization)) ||
          request.method==='prepare'&&(execution.stage!=='preparing'||execution.observation!==null))throw Error('effect_blocked');
        if(request.method==='commit')store.assertCleanupCommitAllowed(requestId,request.authorization);
        const reply=validated('ssh-cleanup-delete-response',await read(options.deleteTarget!(request,store.cleanupContext(requestId)),60000) as import('../../contracts/generated/ssh-cleanup-delete-response.ts').TrustedCleanupDeletionResponseV5);
        for(const key of ['requestId','installationId','targetId','targetRevision','method'] as const)if(reply[key]!==request[key])throw Error('identity_mismatch');
        return reply;
      },
    }};
    const loaded=await loadExtension(freezeProfile(context.run.id,snapshot.digest,pin,options.host),options.host,services);
    type DeletionAction=ActionAdapter & {commit(operation:RecordOf<'operation'>['request'],authorization:NonNullable<TrustedCleanupDeletionRequestV5['authorization']>):Promise<import('./execution.ts').BoundResult>;
      release(operation:RecordOf<'operation'>['request']):Promise<import('./execution.ts').BoundResult>};
    const adapter=loaded.instance as DeletionAction;
    if(typeof adapter.commit!=='function'||typeof adapter.release!=='function')throw Error('unsupported_capability');
    const first=!saved;
    const operation=saved?.operation??store.beginCleanupDeletion(requestId);
    loaded.checkInput(operation.inputs);await adapter.validate(operation);
    // Reconciliation talks directly to the configured trusted connector. An
    // extension's result can never manufacture target deletion evidence.
    const inspect=async()=>{
      const b=await services.target.binding(operation);
      const reply=await services.target.invoke({schemaVersion:'5.0',requestId:operation.operationId,installationId:b.installationId,targetId:operation.targetId,
        targetRevision:b.revision as number,method:'inspect',operation,authorization:null});
      return store.observeCleanupDeletion(requestId,reply);
    };
    if(first) {
      try {
        const result=await adapter.start(operation,validated<Claim>('execution-record',{schemaVersion:'1.0',kind:'claim',id:operation.operationId,operationId:operation.operationId,
          attemptId:operation.operationId,executorId:'cleanup-deletion',resourceKey:`cleanup:${operation.workspaceId}`,requestDigest:operation.requestDigest,fencingNumber:1,createdAt:store.cleanupNow()}));
        loaded.checkOutput(result);
      } catch { /* Preserve possible preparation; inspect the original operation. */ }
    }
    let reply=await inspect(); saved=store.cleanupExecution(requestId)!;
    if(['deleted','blocked','released'].includes(reply.state))return;
    if(reply.state==='prepared' && reply.preparation && saved.stage!=='committing') {
      const decision=await assess(requestId,reply.preparation);
      if(decision.eligible) {
        const authorization=store.authorizeCleanupDeletion(requestId,reply.preparation);
        try {const result=await adapter.commit(operation,authorization);loaded.checkOutput(result);}catch{/* Inspect; never repeat commit. */}
        reply=await inspect();
        if(reply.state!=='prepared')return;
      }
      // A refused or undelivered pre-move commit may release only the original
      // fenced directory. Moving/removing states are completed by inspection.
      try {const result=await adapter.release(operation);loaded.checkOutput(result);}catch{/* Retain the fence on uncertainty. */}
      await inspect();
    } else if(reply.state==='prepared' || reply.state==='fenced') {
      // Preparation/commit may have been interrupted. Do not replay start or
      // revive stale authorization: reconcile a known pre-move release instead.
      try {const result=await adapter.release(operation);loaded.checkOutput(result);}catch{/* Keep unknown. */}
      await inspect();
    }
  }
  return { assess, async tick() {
    if (running) return; running = true;
    try {
      store.scheduleCompletionCleanup();
      for (const request of store.cleanupRequests()) {
        const now = Date.parse(store.cleanupNow()); if ((nextRead.get(request.id) ?? 0) > now) continue;
        const config = store.runConfiguration(request.runId)!.configuration;
        nextRead.set(request.id, now + config.github.pollIntervalSeconds * 1000);
        try { await assess(request.id); } catch { if(!store.cleanupExecution(request.id))store.cleanupAssessmentUnavailable(request.id); }
      }
    } finally { running = false; }
  } };
}
