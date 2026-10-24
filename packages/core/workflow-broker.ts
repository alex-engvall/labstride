import type { RecordOf } from './lifecycle.ts';
import { LifecycleError } from './lifecycle.ts';
import { digest } from '../configuration/json.ts';
export type Enrollment = import('../../contracts/generated/workflow-enrollment.ts').WorkflowEnrollmentV1;
export type WorkflowClaim = import('../../contracts/generated/workflow-claim.ts').AuthenticatedWorkflowClaimV1;
export type WorkflowDispatch = import('../../contracts/generated/workflow-dispatch.ts').WorkflowDispatchRecordV1;
export type WorkflowMessage = import('../../contracts/generated/workflow-message.ts').WorkflowBrokerMessageV1;
export type WorkflowReceipt = import('../../contracts/generated/receipt.ts').LabstrideWorkflowReceiptV1;
export type Operation = RecordOf<'operation'>['request'];
export const workflowAction = 'labstride.github-workflow';
export const workflowVersion = '1.0.0';
export class BrokerError extends LifecycleError {
  readonly status: number;
  constructor(code: 'invalid_payload' | 'identity_rejected' | 'provider_unavailable' | 'not_found' |
    'claim_conflict' | 'effect_consumed' | 'effect_blocked' | 'receipt_conflict' | 'broker_unavailable', status: number) { super(code); this.status = status; }
}
export const workflowResource = (enrollment: Enrollment) => `workflow:${digest([enrollment.targetId, enrollment.environment])}`;
export const workflowRunName = (op: Operation) => `labstride:${op.operationId}:${op.requestDigest}`;
export interface WorkflowRun {
  runId: string; runAttempt: number; repositoryId: string; repositoryNodeId: string; repository: string; ownerId: string;
  workflowId: string; workflowPath: string; refName: string; workflowSha: string; event: string;
  status: string; conclusion: string | null; name: string; createdAt: string;
}
export interface WorkflowProvider {
  // Read-only ancestry of immutable source SHAs. Optional for workflow-only adapters.
  compare?(enrollment: Enrollment, source: Operation['source'], baseSha: string, headSha: string): Promise<import('../../contracts/generated/revision-comparison.ts').RevisionComparisonV1>;
  preflight(enrollment: Enrollment, op: Operation): Promise<void>;
  dispatch(enrollment: Enrollment, op: Operation): Promise<string | null>;
  run(enrollment: Enrollment, runId: string, attempt: number): Promise<WorkflowRun>;
  find(enrollment: Enrollment, op: Operation, submittedAt: string): Promise<WorkflowRun[]>;
}
export function matchingRun(enrollment: Enrollment, op: Operation, run: WorkflowRun, submittedAt: string): boolean {
  return run.repositoryId === enrollment.repository.id && run.repositoryNodeId === enrollment.repository.nodeId &&
    run.repository === enrollment.repository.name && run.ownerId === enrollment.repository.ownerId &&
    run.workflowId === enrollment.workflowId && run.workflowPath === enrollment.workflowPath &&
    run.workflowSha === enrollment.workflowSha && run.refName === enrollment.ref.replace(/^refs\/(heads|tags)\//, '') &&
    run.event === 'workflow_dispatch' && run.name === workflowRunName(op) &&
    Number.isFinite(Date.parse(run.createdAt)) && Date.parse(run.createdAt) >= Date.parse(submittedAt) - 5000;
}
