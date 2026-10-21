import { LifecycleError } from './lifecycle.ts';
import type { RecordOf } from './lifecycle.ts';
import { defaultRetryPolicy } from './execution.ts';
import type { ActionAdapter, BoundResult, Claim, ExecutionPort, RetryPolicy } from './execution.ts';

export class PreEffectTransient extends Error {}
export interface WorkerOptions {
  executorId: string;
  adapters: ReadonlyMap<string, ActionAdapter>;
  nextAttempt: () => string;
  retry?: RetryPolicy;
  random?: () => number;
  projections?: (result: BoundResult) => RecordOf<'projection'>[];
}
// The key is an exact, trusted action ID/version pair, not an import path.
export const actionKey = (id: string, version: string): string => JSON.stringify([id, version]);
export function createWorker(store: ExecutionPort, options: WorkerOptions) {
  let ticking = false;
  const policy = { ...(options.retry ?? defaultRetryPolicy) };
  if (!Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1 || policy.maxAttempts > 100 ||
    !Number.isFinite(policy.baseMs) || policy.baseMs < 1 || !Number.isFinite(policy.capMs) ||
    policy.capMs < policy.baseMs || policy.capMs > 86400000) throw new LifecycleError('invalid_payload');
  const adapters = new Map(options.adapters);
  const retry = () => policy;
  return {
    async tick(): Promise<void> {
      if (ticking) return;
      ticking = true;
      try {
        for (const delivery of store.dueOperations()) {
          const id = delivery.operationId!;
          let op = store.get('operation', id);
          const adapter = adapters.get(actionKey(op.request.actionId, op.request.actionVersion));
          if (!adapter) { store.block(delivery.id, 'unsupported_capability'); continue; }
          if (delivery.state === 'reconcile' || op.state !== 'prepared') {
            if (!['succeeded','failed','cancelled'].includes(op.state)) store.markUnknown(id);
            op = store.get('operation', id);
            try {
              const result = await adapter.reconcile(structuredClone(op.request), store.operationHandle(id));
              store.acceptResult(result, null, op.revision, options.projections?.(result));
              if (store.delivery(delivery.id).state === 'reconcile') store.retryRead(delivery.id, retry(), (options.random ?? Math.random)());
            } catch { store.retryRead(delivery.id, retry(), (options.random ?? Math.random)()); }
            continue;
          }
          try { await adapter.validate(structuredClone(op.request)); }
          catch (error) {
            if (error instanceof PreEffectTransient) store.retryRead(delivery.id, retry(), (options.random ?? Math.random)());
            else store.block(delivery.id, 'validation_failed');
            continue;
          }
          let claim: Claim;
          try {
            claim = store.claim(id, options.executorId, options.nextAttempt());
            store.beginEffect(claim);
          } catch (error) {
            if (error instanceof LifecycleError && ['resource_busy','effect_consumed','revision_conflict'].includes(error.code)) continue;
            if (error instanceof LifecycleError && error.code === 'effect_blocked') { store.block(delivery.id, 'effect_blocked'); continue; }
            throw error;
          }
          // No automatic retry can cross this boundary, even if the adapter throws a transport error.
          try {
            const result = await adapter.start(structuredClone(store.get('operation', id).request), structuredClone(claim));
            store.acceptResult(result, claim, op.revision, options.projections?.(result));
          } catch { store.markUnknown(id); }
        }
      } finally { ticking = false; }
    },
  };
}
