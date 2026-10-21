import { LifecycleError } from './lifecycle.ts';
import { actionKey } from './worker.ts';
import type { ExecutionPort } from './execution.ts';
import type { WorkerOptions } from './worker.ts';

export interface ControlPort extends ExecutionPort {
  dueCancellations(): { operationId: string; controlId: string }[];
  beginCancellation(operationId: string): void;
  cancellationState(operationId: string, state: 'requested' | 'unsupported' | 'outcome_unknown'): void;
}
// A separate one-job lane: a pending action response cannot prevent an explicit stop.
export function createControlWorker(store: ControlPort, options: WorkerOptions) {
  const adapters = new Map(options.adapters);
  let job: Promise<void> | undefined;
  let error: unknown;
  let closed = false;
  async function cancel(operationId: string, controlId: string) {
    const op = store.get('operation', operationId);
    const adapter = adapters.get(actionKey(op.request.actionId, op.request.actionVersion));
    if (!adapter?.cancel) { store.cancellationState(operationId, 'unsupported'); return; }
    const handle = store.operationHandle(operationId);
    if (!handle) return; // Observe the original effect until its handle is known; never substitute one.
    const epoch = store.recoveryEpoch();
    try { store.beginCancellation(operationId); }
    catch (error) {
      if (error instanceof LifecycleError && ['effect_blocked','effect_consumed'].includes(error.code)) return;
      throw error;
    }
    try {
      const result = store.validateResult(await adapter.cancel(structuredClone(op.request), handle, controlId));
      if (result.operationId !== op.id || result.requestDigest !== op.request.requestDigest || result.result.handle !== handle)
        throw new LifecycleError('identity_conflict');
      if (result.result.status !== 'accepted') {
        store.markUnknown(op.id);
        store.acceptResult(result, null, store.get('operation', op.id).revision, [], epoch);
      }
      store.cancellationState(op.id, result.result.status === 'outcome_unknown' ? 'outcome_unknown' : 'requested');
    } catch {
      store.cancellationState(op.id, 'outcome_unknown');
      store.markUnknown(op.id);
    }
  }
  return {
    async tick(): Promise<void> {
      if (closed || job) return;
      const next = store.dueCancellations().find(item => {
        const request = store.get('operation', item.operationId).request;
        return !adapters.get(actionKey(request.actionId, request.actionVersion))?.cancel || store.operationHandle(item.operationId) !== null;
      });
      if (next) job = cancel(next.operationId, next.controlId).catch(e => { error = e; }).finally(() => { job = undefined; });
    },
    async drain(): Promise<void> { await job; if (error) { const e = error; error = undefined; throw e; } },
    async close(): Promise<void> { closed = true; await this.drain(); },
  };
}
