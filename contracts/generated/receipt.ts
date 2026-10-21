/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export type LabstrideWorkflowReceiptV1 = {
  schemaVersion: "1.0";
  operationId: string;
  requestDigest: string;
  claimId: string;
  fencingNumber: number;
  executor: {
    provider: "github-actions";
    repositoryId: string;
    workflowPath: string;
    workflowSha: string;
    runId: string;
    runAttempt: number;
  };
  sourceSha: string;
  targetId: string;
  conclusion: "succeeded" | "failed" | "cancelled" | "outcome_unknown";
  observedAt: string;
  /**
   * @minItems 0
   */
  resources: {
    type: string;
    id: string;
    state: string;
  }[];
  outputs: {
    [k: string]: unknown;
  };
  error?: {
    code: string;
    message: string;
    retryClass: "none" | "read_only" | "pre_effect_transient" | "reconcile";
  };
};
