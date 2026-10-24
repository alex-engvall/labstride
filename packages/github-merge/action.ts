import { mergeAction, mergeVersion, MergeBlocked } from '../core/merges.ts';
import type { MergeOperation, MergeProvider } from '../core/merges.ts';
import type { ActionAdapter, BoundResult } from '../core/execution.ts';
import type { MergeStore } from '../storage-sqlite/merges.ts';
import { loadExtension, freezeProfile } from '../extensions/loader.ts';
import type { HostProfile } from '../extensions/loader.ts';
import { digest } from '../configuration/json.ts';
import { validated } from '../storage-sqlite/validation.ts';

export function configuredMergeAction(store: MergeStore, host: HostProfile, provider: MergeProvider): ActionAdapter {
  function result(op: MergeOperation, status: 'accepted' | 'outcome_unknown' | 'succeeded' | 'failed', outputs: Record<string, unknown> = {}): BoundResult {
    return { schemaVersion: '1.0', kind: 'result', operationId: op.operationId, requestDigest: op.requestDigest,
      result: { status, handle: op.operationId, resources: [], outputs, evidenceRefs: [`merge:${op.operationId}`],
        error: ['outcome_unknown','failed'].includes(status) ? { code: status === 'failed' ? 'operation_failed' : 'outcome_unknown',
          message: 'Inspect the bound merge evidence; this operation never resubmits a merge intent.', retryClass: status === 'failed' ? 'none' : 'reconcile', evidenceId: null } : null } };
  }
  const port = {
    async validate(op: MergeOperation) { store.mergeBinding(op.operationId); },
    async start(op: MergeOperation) { return port.reconcile(op); },
    async reconcile(op: MergeOperation): Promise<BoundResult> {
      const epoch = store.recoveryEpoch();
      const { enrollment, input } = store.mergeBinding(op.operationId);
      let record = store.mergeRecord(op.operationId);
      if (!record) {
        try {
          const before = await provider.gate(enrollment, input), fresh = await provider.gate(enrollment, input);
          if (digest(before) !== digest(fresh)) throw new MergeBlocked('merge_context_changed');
          // No await between the transactional policy/intent check and invoking
          // the provider. Existing intent always switches to observation only.
          if (store.beginMergeIntent(op.operationId, fresh, epoch)) {
            try { store.recordMergeResponse(op.operationId, await provider.merge(enrollment, input)); }
            catch { return result(op, 'outcome_unknown', { blocker: 'merge_outcome_unknown' }); }
          }
        } catch (error) {
          if (store.mergeRecord(op.operationId)) return result(op, 'outcome_unknown');
          const code = error instanceof MergeBlocked ? error.code : 'merge_gate_unavailable';
          store.mergeBlocker(op.operationId, code);
          return result(op, 'accepted', { blocker: code });
        }
        record = store.mergeRecord(op.operationId);
      }
      if (!record) return result(op, 'outcome_unknown');
      if (record.outcome === 'rejected') return result(op, 'failed', { blocker: 'merge_rejected', merge: record });
      if (record.outcome !== 'confirmed' && record.outcome !== 'conflict') {
        try { record = store.recordMergeObservation(op.operationId, await provider.observe(enrollment, input), epoch); }
        catch { return result(op, 'outcome_unknown', { blocker: 'merge_observation_unavailable' }); }
      }
      return result(op, record.outcome === 'confirmed' ? 'succeeded' : 'outcome_unknown', { merge: record,
        mergeSha: record.mergeSha, sourceSha: input.expectedHead, blocker: record.outcome === 'confirmed' ? null : `merge_${record.outcome}` });
    },
  };
  async function resolve(op: MergeOperation) {
    store.mergeBinding(op.operationId);
    const snapshot = store.runConfiguration(op.runId)!;
    const pin = snapshot.extensionLock.extensions.find(pin => pin.id === mergeAction && pin.version === mergeVersion && pin.kind === 'action')!;
    const loaded = await loadExtension(freezeProfile(op.runId, snapshot.digest, pin, host), host, { merge: port });
    loaded.checkInput(op.inputs);
    return { loaded, instance: loaded.instance as ActionAdapter };
  }
  async function invoke(op: MergeOperation, method: 'start' | 'reconcile', claim?: Parameters<ActionAdapter['start']>[1]): Promise<BoundResult> {
    const { loaded, instance } = await resolve(op);
    const bound = method === 'start' ? await instance.start(op, claim!) : await instance.reconcile(op, op.operationId);
    loaded.checkOutput(bound); return validated('execution-record', bound) as BoundResult;
  }
  return { continuousReconciliation: true,
    async validate(op) { const { instance } = await resolve(op); await instance.validate(op); },
    async start(op, claim) { return invoke(op, 'start', claim); },
    async reconcile(op) { return invoke(op, 'reconcile'); } };
}
