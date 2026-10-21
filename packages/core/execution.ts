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
