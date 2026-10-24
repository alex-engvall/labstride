/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface DeploymentEvidenceV1 {
  schemaVersion: "1.0";
  operationId: string;
  requestDigest: string;
  enrollmentDigest: string;
  claim: AuthenticatedWorkflowClaimV1;
  receiptDigest: string;
  recipe: {
    id: string;
    version: string;
    digest: string;
  };
  sourceRepositoryId: string;
  sourceSha: string;
  targetId: string;
  environment: string;
  workflow: {
    runId: string;
    repositoryId: string;
    repositoryNodeId: string;
    repository: string;
    ownerId: string;
    workflowId: string;
    workflowPath: string;
    refName: string;
    workflowSha: string;
    event: string;
    status: string;
    name: string;
    runAttempt: number;
    conclusion: string | null;
    createdAt: string;
  };
  probeRequest: TargetObservationRequestV1;
  target: IndependentTargetObservationV1 | null;
  observedAt: string;
  recoveryEpoch: number;
  status: "verified" | "failed" | "outcome_unknown";
  blocker:
    | "none"
    | "workflow_failed"
    | "target_unhealthy"
    | "target_revision_mismatch"
    | "target_identity_mismatch"
    | "target_observation_stale"
    | "target_observation_invalid"
    | "target_observer_unavailable"
    | "target_health_unknown";
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
export interface TargetObservationRequestV1 {
  schemaVersion: "1.0";
  observationId: string;
  targetId: string;
  environment: string;
  configuration: {
    [k: string]: unknown;
  };
}
export interface IndependentTargetObservationV1 {
  schemaVersion: "1.0";
  observationId: string;
  targetId: string;
  environment: string;
  resourceId: string;
  sourceRepositoryId: string;
  sourceSha: string | null;
  health: "healthy" | "unhealthy" | "unknown";
  observedAt: string;
}
