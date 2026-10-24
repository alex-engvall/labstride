/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

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
