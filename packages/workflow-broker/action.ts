import { enrolledWorkflow } from '../workflow-broker/bindings.ts';
import { loadExtension, freezeProfile } from '../extensions/loader.ts';
import type { HostProfile } from '../extensions/loader.ts';
import type { ActionAdapter, BoundResult } from '../core/execution.ts';
import { PreEffectTransient } from '../core/worker.ts';
import { BrokerError, matchingRun, workflowAction, workflowVersion } from '../core/workflow-broker.ts';
import type { Operation, WorkflowProvider } from '../core/workflow-broker.ts';
import { validated } from '../storage-sqlite/validation.ts';
import type { WorkflowBrokerStore } from '../storage-sqlite/workflow-broker.ts';
import { randomUUID } from 'node:crypto';
import { deploymentId, resolveObserver, recoveryDetails } from '../core/deployments.ts';
import type { DeploymentObservers, TargetObservation, TargetObservationRequest } from '../core/deployments.ts';

export function configuredWorkflowAction(store: WorkflowBrokerStore, host: HostProfile, provider: WorkflowProvider,
  observers: DeploymentObservers = new Map()): ActionAdapter {
  const registry = new Map(observers);
  const result = (op: Operation, status: 'accepted' | 'outcome_unknown' | 'succeeded' | 'failed' | 'cancelled', outputs: Record<string, unknown> = {}): BoundResult => ({
    schemaVersion: '1.0', kind: 'result', operationId: op.operationId, requestDigest: op.requestDigest,
    result: { status, handle: op.operationId, resources: [], outputs, evidenceRefs: [`workflow:${op.operationId}`],
      error: status === 'outcome_unknown' || status === 'failed' ? { code: status === 'failed' ? 'operation_failed' : 'outcome_unknown',
        message: 'Observe the bound workflow; no automatic redispatch is permitted.', retryClass: status === 'failed' ? 'none' : 'reconcile', evidenceId: null } : null },
  });
  const deploymentResult = (op: Operation, saved: NonNullable<ReturnType<WorkflowBrokerStore['deploymentEvidence']>>): BoundResult => {
    const enrollment = store.workflowEnrollment(op.operationId), evidence = saved.evidence;
    const bound = result(op, evidence.status === 'verified' ? 'succeeded' : evidence.status,
      { workflowReceipt: store.workflowReceipt(op.operationId)!, workflowSha: enrollment.workflowSha, sourceSha: op.source.sha,
        deploymentVerified: evidence.status === 'verified', deploymentEvidenceId: saved.id, blocker: evidence.blocker,
        recovery: recoveryDetails(enrollment.deployment!, op.targetId, enrollment.environment) });
    bound.result.evidenceRefs.push(`deployment:${saved.id}`);
    if (bound.result.error) bound.result.error.message = 'Deployment verification is blocked; inspect target evidence and the recipe recovery limits.';
    return bound;
  };
  const port = {
    async validate(op: Operation) {
      const enrollment = store.workflowEnrollment(op.operationId);
      if (enrollment.deployment) {
        const observer = resolveObserver(enrollment.deployment, registry);
        await observer.validate(structuredClone(enrollment.deployment.observer.configuration));
      }
      try { await provider.preflight(enrollment, op); }
      catch (error) { if (error instanceof BrokerError && error.code === 'provider_unavailable') throw new PreEffectTransient(); throw error; }
    },
    async start(op: Operation) {
      const intent = store.beginWorkflowDispatch(op.operationId);
      if (intent.dispatch) {
        // Once committed, every error is uncertain. A lost HTTP response cannot
        // authorize another POST, even across process death.
        try {
          const runId = await provider.dispatch(intent.record.enrollment, op);
          if (runId !== null) store.bindWorkflowRun(op.operationId, runId);
        } catch { return result(op, 'outcome_unknown'); }
      }
      return port.reconcile(op);
    },
    async reconcile(op: Operation): Promise<BoundResult> {
      const epoch = store.recoveryEpoch();
      const dispatch = store.workflowDispatch(op.operationId);
      if (!dispatch || store.workflowConflicted(op.operationId)) return result(op, 'outcome_unknown');
      const candidates = await provider.find(dispatch.enrollment, op, dispatch.submittedAt);
      if (candidates.length > 1) { store.workflowConflict(op.operationId); return result(op, 'outcome_unknown'); }
      if (candidates.length !== 1 || !matchingRun(dispatch.enrollment, op, candidates[0], dispatch.submittedAt)) return result(op, 'outcome_unknown');
      const candidate = candidates[0];
      store.bindWorkflowRun(op.operationId, candidate.runId);
      const claim = store.workflowClaim(op.operationId);
      if (!claim || candidate.runAttempt !== claim.executor.runAttempt) return result(op, 'outcome_unknown');
      const run = await provider.run(dispatch.enrollment, claim.executor.runId, claim.executor.runAttempt);
      if (run.runId !== claim.executor.runId || run.runAttempt !== claim.executor.runAttempt ||
        !matchingRun(dispatch.enrollment, op, run, dispatch.submittedAt)) return result(op, 'outcome_unknown');
      if (['queued','in_progress','waiting','pending','requested'].includes(run.status)) return result(op, 'accepted');
      const receipt = store.finishWorkflowObservation(op.operationId, run);
      if (!receipt) return result(op, 'outcome_unknown');
      const profile = dispatch.enrollment.deployment;
      if (profile) {
        const previous = store.deploymentEvidence(op.operationId);
        const deployment = store.get('deployment', deploymentId(op.operationId));
        // A durably observed failure survives death before finalization. A later
        // healthy sample is recovery evidence, not success of the failed release.
        if (previous && (previous.evidence.status === 'failed' || ['verified', 'failed'].includes(deployment.state))) return deploymentResult(op, previous);
        const request: TargetObservationRequest = { schemaVersion: '1.0', observationId: randomUUID(), targetId: op.targetId,
          environment: dispatch.enrollment.environment, configuration: structuredClone(profile.observer.configuration) };
        let target: TargetObservation | null = null;
        let unavailable: 'target_observer_unavailable' | 'target_observation_invalid' = 'target_observer_unavailable';
        if (receipt.conclusion === 'succeeded') {
          const controller = new AbortController();
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const observer = resolveObserver(profile, registry);
            const raw = await Promise.race([
              (async () => { await observer.validate(structuredClone(profile.observer.configuration)); return observer.observe(structuredClone(request), controller.signal); })(),
              new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('target_observer_unavailable')); }, profile.observationTimeoutMs ?? 15000); }),
            ]);
            unavailable = 'target_observation_invalid';
            target = validated('target-observation', raw as TargetObservation);
          } catch { /* Persist safe uncertainty, never raw adapter errors or payloads. */ }
          finally { clearTimeout(timer); controller.abort(); }
        }
        return deploymentResult(op, store.recordDeploymentObservation(op.operationId, run, request, target, unavailable, epoch));
      }
      // A workflow-only enrollment cannot create a verified deployment.
      return result(op, receipt.conclusion, { workflowReceipt: receipt, workflowSha: dispatch.enrollment.workflowSha,
        sourceSha: op.source.sha, deploymentVerified: false });
    },
  };
  const resolve = async (op: Operation) => {
    const snapshot = store.runConfiguration(op.runId);
    enrolledWorkflow(snapshot, op);
    const pin = snapshot!.extensionLock.extensions.find(pin => pin.id === workflowAction && pin.version === workflowVersion && pin.kind === 'action')!;
    const loaded = await loadExtension(freezeProfile(op.runId, snapshot!.digest, pin, host), host, { workflow: port });
    const instance = loaded.instance as ActionAdapter;
    if (!instance || typeof instance.validate !== 'function' || typeof instance.start !== 'function' || typeof instance.reconcile !== 'function') throw new BrokerError('effect_blocked', 403);
    loaded.checkInput(op.inputs);
    return { loaded, instance };
  };
  const check = (loaded: Awaited<ReturnType<typeof loadExtension>>, bound: BoundResult): BoundResult => {
    loaded.checkOutput(bound); return validated('execution-record', bound) as BoundResult;
  };
  return {
    continuousReconciliation: true,
    async validate(op) { const { instance } = await resolve(op); await instance.validate(op); },
    async start(op, claim) { const { instance, loaded } = await resolve(op); return check(loaded, await instance.start(op, claim)); },
    async reconcile(op, handle) { const { instance, loaded } = await resolve(op); return check(loaded, await instance.reconcile(op, handle)); },
  };
}
