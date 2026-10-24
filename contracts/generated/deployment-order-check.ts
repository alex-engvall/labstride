/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface DeploymentOrderCheckV1 {
  schemaVersion: "1.0";
  operationId: string;
  requestDigest: string;
  sequence: number;
  resourceKey: string;
  predecessorOperationId: string | null;
  predecessorEvidenceId: string | null;
  targetRevision: number;
  recoveryEpoch: number;
  comparison: RevisionComparisonV1 | null;
  decision: "allow" | "supersede" | "blocked";
  blocker:
    | "none"
    | "older_queued_revision"
    | "revision_already_delivered"
    | "revision_diverged"
    | "comparison_unavailable"
    | "legacy_order_unknown"
    | "target_busy";
  observedAt: string;
}
export interface RevisionComparisonV1 {
  schemaVersion: "1.0";
  repositoryId: string;
  baseSha: string;
  headSha: string;
  relation: "identical" | "ahead" | "behind" | "diverged";
}
