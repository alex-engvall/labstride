/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export type WorkflowBrokerReplyV1 =
  | {
      schemaVersion: "1.0";
      operation: LabstrideOperationRequestV1;
      enrollment: WorkflowEnrollmentV1;
      claim: AuthenticatedWorkflowClaimV1;
    }
  | {
      schemaVersion: "1.0";
      authorized: true;
      claimId: string;
    }
  | {
      schemaVersion: "1.0";
      received: true;
    }
  | {
      schemaVersion: "1.0";
      error:
        | "invalid_payload"
        | "identity_rejected"
        | "provider_unavailable"
        | "not_found"
        | "claim_conflict"
        | "effect_consumed"
        | "effect_blocked"
        | "receipt_conflict"
        | "broker_unavailable";
    };

export interface LabstrideOperationRequestV1 {
  schemaVersion: "1.0";
  operationId: string;
  runId: string;
  workspaceId: string;
  actionId: string;
  actionVersion: string;
  configDigest: string;
  requestDigest: string;
  source: {
    repositoryId: string;
    repository: string;
    sha: string;
  };
  targetId: string;
  deadline: string;
  inputs: {
    [k: string]: unknown;
  };
}
export interface WorkflowEnrollmentV1 {
  schemaVersion: "1.0";
  repository: {
    name: string;
    nodeId: string;
    id: string;
    ownerId: string;
  };
  workflowId: string;
  workflowPath: string;
  ref: string;
  workflowSha: string;
  targetId: string;
  environment: string;
  credentialRef: string;
  inputs: {
    [k: string]: string;
  };
}
export interface AuthenticatedWorkflowClaimV1 {
  schemaVersion: "1.0";
  operationId: string;
  requestDigest: string;
  claimId: string;
  fencingNumber: number;
  executor: Executor;
}
export interface Executor {
  provider: "github-actions";
  repositoryId: string;
  workflowPath: string;
  workflowSha: string;
  runId: string;
  runAttempt: number;
}
