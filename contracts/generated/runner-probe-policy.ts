/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export type Id = string;

export interface OperatorEnrolledRunnerDiagnosticPolicyV1 {
  schemaVersion: "1.0";
  audience: string;
  repository: string;
  repositoryId: Id;
  ownerId: Id;
  workflowPath: string;
  ref: string;
  workflowSha: string;
  runId: Id;
  runAttempt: Id;
  eventName: "push";
}
