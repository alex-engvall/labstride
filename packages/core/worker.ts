import { LifecycleError } from './lifecycle.ts';
import type { RecordOf } from './lifecycle.ts';
import { defaultRetryPolicy } from './execution.ts';
import type { ActionAdapter, BoundResult, Claim, Delivery, ExecutionPort, RetryPolicy } from './execution.ts';

export class PreEffectTransient extends Error {}
export interface WorkerOptions {
  executorId: string;
  adapters: ReadonlyMap<string, ActionAdapter>;
  nextAttempt: () => string;
  retry?: RetryPolicy;
  random?: () => number;
  maxJobs?: number;
  projections?: (result: BoundResult) => RecordOf<'projection'>[];
}
// The key is an exact, trusted action ID/version pair, not an import path.
export const actionKey = (id: string, version: string): string => JSON.stringify([id, version]);
export function createWorker(store: ExecutionPort, options: WorkerOptions) {
  const jobs = new Map<string, Promise<void>>();
  let failure: unknown;
  let stopped = false;
  const policy = { ...(options.retry ?? defaultRetryPolicy) };
  if (!Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1 || policy.maxAttempts > 100 ||
    !Number.isFinite(policy.baseMs) || policy.baseMs < 1 || !Number.isFinite(policy.capMs) ||
    policy.capMs < policy.baseMs || policy.capMs > 86400000) throw new LifecycleError('invalid_payload');
  const adapters = new Map(options.adapters);
  const retry = () => policy;
  const maxJobs = options.maxJobs ?? 8;
  if (!Number.isSafeInteger(maxJobs) || maxJobs < 1 || maxJobs > 1024) throw new LifecycleError('invalid_payload');
  async function execute(delivery: Delivery): Promise<void> {
    const id = delivery.operationId!;
    let op = store.get('operation', id);
    const adapter = adapters.get(actionKey(op.request.actionId, op.request.actionVersion));
    if (!adapter) { store.block(delivery.id, 'unsupported_capability'); return; }
    if (delivery.state === 'pending' && op.state === 'prepared' && adapter.requiresSessionGuard && !store.sessionGuard(id)) {
      store.block(delivery.id, 'validation_failed'); return;
    }
    if (delivery.state === 'reconcile' || op.state !== 'prepared') {
      if (!['succeeded','failed','cancelled','superseded'].includes(op.state)) store.markUnknown(id);
      op = store.get('operation', id);
      const epoch = store.recoveryEpoch();
      try {
        const result = await adapter.reconcile(structuredClone(op.request), store.operationHandle(id));
        if (result.operationId !== id || result.requestDigest !== op.request.requestDigest) throw new LifecycleError('identity_conflict');
        store.acceptResult(result, null, op.revision, options.projections?.(result), epoch, adapter.createsWorkspace);
        if ((result.result.status === 'accepted' || adapter.continuousReconciliation && ['outcome_unknown','superseded'].includes(result.result.status)) && store.deferOperationObservation) store.deferOperationObservation(id, 15000);
        else if (store.delivery(delivery.id).state === 'reconcile') store.retryRead(delivery.id, retry(), (options.random ?? Math.random)());
      } catch {
        if (adapter.continuousReconciliation && store.deferOperationObservation) store.deferOperationObservation(id, 15000);
        else store.retryRead(delivery.id, retry(), (options.random ?? Math.random)());
      }
      return;
    }
    try { await adapter.validate(structuredClone(op.request)); }
    catch (error) {
      if (error instanceof PreEffectTransient) store.retryRead(delivery.id, retry(), (options.random ?? Math.random)());
      else if (error instanceof LifecycleError && ['unsupported_capability','stale_revision'].includes(error.code)) store.block(delivery.id, error.code);
      else store.block(delivery.id, 'validation_failed');
      return;
    }
    let claim: Claim;
    try {
      claim = store.claim(id, options.executorId, options.nextAttempt());
      store.beginEffect(claim, adapter.atomicSessionGuards === true, adapter.createsWorkspace);
    } catch (error) {
      if (error instanceof LifecycleError && ['unsupported_capability','stale_revision'].includes(error.code)) { store.block(delivery.id, error.code); return; }
      if (error instanceof LifecycleError && ['resource_busy','effect_consumed','revision_conflict','capacity_wait','issue_busy','effect_blocked'].includes(error.code)) return;
      throw error;
    }
    // No automatic retry can cross this boundary, even if the adapter throws a transport error.
    try {
      const result = await adapter.start(structuredClone(store.get('operation', id).request), structuredClone(claim), store.sessionGuard(id));
      store.acceptResult(result, claim, op.revision, options.projections?.(result), 0, adapter.createsWorkspace);
      if (result.result.status === 'accepted' || adapter.continuousReconciliation && ['outcome_unknown','superseded'].includes(result.result.status)) store.deferOperationObservation?.(id, 15000);
    } catch { store.markUnknown(id); }
  }
  return {
    async tick(): Promise<void> {
      if (stopped) return;
      if (failure) { const error = failure; failure = undefined; throw error; }
      for (const delivery of store.dueOperations()) {
        if (jobs.size >= maxJobs) break;
        if (jobs.has(delivery.id)) continue;
        const job = execute(delivery).catch(error => { failure ??= error; }).finally(() => { jobs.delete(delivery.id); });
        jobs.set(delivery.id, job);
      }
    },
    async drain(): Promise<void> {
      await Promise.all(jobs.values());
      if (failure) { const error = failure; failure = undefined; throw error; }
    },
    async close(): Promise<void> { stopped = true; await this.drain(); },
  };
}
