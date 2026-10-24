/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface DeploymentSuccessorEvidenceV1 {
  schemaVersion: "1.0";
  operationId: string;
  requestDigest: string;
  successorOperationId: string;
  successorEvidenceId: string;
  targetRevision: number;
  mergeOperationId: string;
  mergeRecordDigest: string;
  mergeSha: string;
  comparison: RevisionComparisonV1;
  probeRequest: TargetObservationRequestV1;
  target: IndependentTargetObservationV1;
  observedAt: string;
  recoveryEpoch: number;
}
export interface RevisionComparisonV1 {
  schemaVersion: "1.0";
  repositoryId: string;
  baseSha: string;
  headSha: string;
  relation: "identical" | "ahead" | "behind" | "diverged";
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
