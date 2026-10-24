import { enrolledWorkflow } from '../workflow-broker/bindings.ts';
import { loadExtension, freezeProfile } from '../extensions/loader.ts';
import type { HostProfile } from '../extensions/loader.ts';
import type { ActionAdapter, BoundResult } from '../core/execution.ts';
import { PreEffectTransient } from '../core/worker.ts';
import { BrokerError, matchingRun, workflowAction, workflowVersion } from '../core/workflow-broker.ts';
import type { Operation, WorkflowProvider } from '../core/workflow-broker.ts';
import { validated } from '../storage-sqlite/validation.ts';
import type { WorkflowBrokerStore } from '../storage-sqlite/workflow-broker.ts';

export function configuredWorkflowAction(store: WorkflowBrokerStore, host: HostProfile, provider: WorkflowProvider): ActionAdapter {
  const result = (op: Operation, status: 'accepted' | 'outcome_unknown' | 'succeeded' | 'failed' | 'cancelled', outputs: Record<string, unknown> = {}): BoundResult => ({
    schemaVersion: '1.0', kind: 'result', operationId: op.operationId, requestDigest: op.requestDigest,
    result: { status, handle: op.operationId, resources: [], outputs, evidenceRefs: [`workflow:${op.operationId}`],
      error: status === 'outcome_unknown' || status === 'failed' ? { code: status === 'failed' ? 'operation_failed' : 'outcome_unknown',
        message: 'Observe the bound workflow; no automatic redispatch is permitted.', retryClass: status === 'failed' ? 'none' : 'reconcile', evidenceId: null } : null },
  });
  const port = {
    async validate(op: Operation) {
      const enrollment = store.workflowEnrollment(op.operationId);
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
      // This proves workflow completion only. It never creates a verified deployment.
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
