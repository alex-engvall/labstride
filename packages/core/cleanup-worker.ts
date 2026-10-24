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
  async function assess(requestId: string) {
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
      const reply = validated('ssh-cleanup-response', await read(options.inspect(request, context),60000) as import('../../contracts/generated/ssh-cleanup-response.ts').TrustedCleanupInspectionResponseV4);
      for (const key of ['requestId', 'installationId', 'targetId', 'targetRevision', 'method'] as const) if (reply[key] !== request[key]) throw Error();
      inspection = reply.inspection;
      if (reply.outcome !== 'ok' || !inspection || inspection.requestId !== requestId || inspection.installationId !== request.installationId ||
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
    if (!decision.eligible) return decision;
    const prior = store.cleanupRequests().find(r => r.id === requestId)!;
    if (prior.operation && prior.state !== 'outcome_unknown') return decision;
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
    return decision;
  }
  return { assess, async tick() {
    if (running) return; running = true;
    try {
      store.scheduleCompletionCleanup();
      for (const request of store.cleanupRequests()) {
        const now = Date.parse(store.cleanupNow()); if ((nextRead.get(request.id) ?? 0) > now) continue;
        const config = store.runConfiguration(request.runId)!.configuration;
        nextRead.set(request.id, now + config.github.pollIntervalSeconds * 1000);
        try { await assess(request.id); } catch { store.cleanupAssessmentUnavailable(request.id); }
      }
    } finally { running = false; }
  } };
}
