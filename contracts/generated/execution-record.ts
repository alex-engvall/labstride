/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export type ExecutionRecord =
  | {
      schemaVersion: "1.0";
      kind: "claim";
      id: string;
      operationId: string;
      executorId: string;
      attemptId: string;
      resourceKey: string;
      requestDigest: string;
      fencingNumber: number;
      createdAt: string;
    }
  | {
      schemaVersion: "1.0";
      kind: "result";
      operationId: string;
      requestDigest: string;
      result: OperationResult;
    };
export type OperationResult = {
  status: "accepted" | "succeeded" | "failed" | "cancelled" | "outcome_unknown" | "superseded";
  handle: string | null;
  /**
   * @maxItems 128
   */
  resources: Resource[];
  /**
   * @maxItems 128
   */
  evidenceRefs: string[];
  outputs: {
    [k: string]: unknown;
  };
  error: Error | null;
};
export type Error = {
  code:
    | "validation_failed"
    | "forbidden"
    | "unsupported_capability"
    | "authentication_failed"
    | "identity_mismatch"
    | "stale_revision"
    | "policy_changed"
    | "resource_busy"
    | "rate_limited"
    | "transient_unavailable"
    | "configuration_invalid"
    | "projection_conflict"
    | "operation_failed"
    | "cancelled"
    | "outcome_unknown";
  message: string;
  evidenceId: string | null;
  retryClass: "none" | "read_only" | "pre_effect_transient" | "reconcile";
};

export interface Resource {
  type: string;
  id: string;
  state: string;
}
