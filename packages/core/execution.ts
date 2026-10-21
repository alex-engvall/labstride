import type { ExecutionInboxInput } from '../../contracts/generated/execution-inbox.ts';
import type { AuditContext, RecordOf } from './lifecycle.ts';
export type InboxInput = ExecutionInboxInput;
export interface InboxEntry { id: string; input: InboxInput; processed: boolean; runId: string | null }
export interface StartPlan {
  request: RecordOf<'request'>; run: RecordOf<'run'>; workspace: RecordOf<'workspace'>;
  operation: RecordOf<'operation'>; outbox: RecordOf<'outbox'>; projections: RecordOf<'projection'>[];
  resourceKey: string;
}
// Only a trusted policy adapter constructs plans/context. These are not event payload fields.
export interface InboxStore {
  receive(input: InboxInput): { id: string; duplicate: boolean };
  pendingEvents(): InboxEntry[];
  scheduleStart(id: string, plan: StartPlan, authorization: AuditContext): string;
}

export type ExecutionRecord = import('../../contracts/generated/execution-record.ts').ExecutionRecord;
export type Claim = Extract<ExecutionRecord, { kind: 'claim' }>;
export type BoundResult = Extract<ExecutionRecord, { kind: 'result' }>;
export type OperationResult = BoundResult['result'];
export interface Delivery {
  id: string; operationId: string | null; projectionId: string | null;
  state: 'pending' | 'reconcile' | 'blocked' | 'done' | 'superseded' | 'conflict';
  attempts: number; nextAt: string; lastError: string | null; revision: number;
}
export interface RetryPolicy { maxAttempts: number; baseMs: number; capMs: number }
export const defaultRetryPolicy: RetryPolicy = { maxAttempts: 5, baseMs: 1000, capMs: 60000 };
export interface ActionAdapter {
  // The embedding application enrolls reviewed adapters; payloads cannot load code.
  validate(operation: RecordOf<'operation'>['request']): Promise<void>;
  start(operation: RecordOf<'operation'>['request'], claim: Claim): Promise<BoundResult>;
  reconcile(operation: RecordOf<'operation'>['request'], handle: string | null): Promise<BoundResult>;
}
export interface ExecutionPort extends InboxStore {
  get<K extends import('./lifecycle.ts').Kind>(kind: K, id: string): RecordOf<K>;
  dueOperations(): Delivery[];
  delivery(id: string): Delivery;
  claim(operationId: string, executorId: string, attemptId: string): Claim;
  beginEffect(claim: Claim): void;
  acceptResult(result: BoundResult, claim: Claim | null, expectedRevision: number, projections?: RecordOf<'projection'>[], observedEpoch?: number): boolean;
  recoveryEpoch(): number;
  markUnknown(operationId: string): void;
  retryRead(id: string, policy: RetryPolicy, random: number): void;
  block(id: string, code: string): void;
  operationHandle(operationId: string): string | null;
}
