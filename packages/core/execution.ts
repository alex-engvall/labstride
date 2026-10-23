import type { AutomationContext } from '../../contracts/generated/automation-context.ts';
import type { ExecutionInboxInput } from '../../contracts/generated/execution-inbox.ts';
import type { AuditContext, RecordOf } from './lifecycle.ts';
export type InboxInput = ExecutionInboxInput;
export interface InboxEntry { id: string; input: InboxInput; processed: boolean; runId: string | null }
export interface StartPlan {
  request: RecordOf<'request'>; run: RecordOf<'run'>; workspace: RecordOf<'workspace'>;
  operation: RecordOf<'operation'>; outbox: RecordOf<'outbox'>; projections: RecordOf<'projection'>[];
  resourceKey: string;
  capacityClass?: 'development' | 'ciReview';
  automation?: AutomationContext;
  configurationSnapshot?: import('../../contracts/generated/configuration-snapshot.ts').EffectiveInstallationConfigurationSnapshot;
}
// Only a trusted policy adapter constructs plans/context. These are not event payload fields.
export interface InboxStore {
  receive(input: InboxInput): { id: string; duplicate: boolean };
  pendingEvents(): InboxEntry[];
  scheduleOperation(plan: Pick<StartPlan, 'operation' | 'outbox' | 'resourceKey' | 'capacityClass' | 'automation'>, authorization: AuditContext): string;
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
export type SessionGuard = NonNullable<AutomationContext['sessionGuard']>;
export interface ActionAdapter {
  requiresSessionGuard?: boolean;
  atomicSessionGuards?: boolean;
  // The embedding application enrolls reviewed adapters; payloads cannot load code.
  cancel?(operation: RecordOf<'operation'>['request'], handle: string, controlId: string): Promise<BoundResult>;
  validate(operation: RecordOf<'operation'>['request']): Promise<void>;
  start(operation: RecordOf<'operation'>['request'], claim: Claim, guard?: SessionGuard): Promise<BoundResult>;
  reconcile(operation: RecordOf<'operation'>['request'], handle: string | null): Promise<BoundResult>;
}
export interface ExecutionPort extends InboxStore {
  get<K extends import('./lifecycle.ts').Kind>(kind: K, id: string): RecordOf<K>;
  dueOperations(): Delivery[];
  delivery(id: string): Delivery;
  claim(operationId: string, executorId: string, attemptId: string): Claim;
  sessionGuard(operationId: string): SessionGuard | undefined;
  beginEffect(claim: Claim, atomicSessionGuards?: boolean): void;
  acceptResult(result: BoundResult, claim: Claim | null, expectedRevision: number, projections?: RecordOf<'projection'>[], observedEpoch?: number): boolean;
  validateResult(result: BoundResult): BoundResult;
  recoveryEpoch(): number;
  markUnknown(operationId: string): void;
  retryRead(id: string, policy: RetryPolicy, random: number): void;
  block(id: string, code: string): void;
  operationHandle(operationId: string): string | null;
}
