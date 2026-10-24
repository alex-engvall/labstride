/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export type TrustedRuntimeHelperResponseV3 = {
  schemaVersion: "3.0";
  requestId: string;
  installationId: string;
  targetId: string;
  targetRevision: number;
  method: "probe" | "create" | "inspect";
  outcome: "ok" | "error" | "outcome_unknown";
  /**
   * @maxItems 3
   */
  capabilities:
    | []
    | ["runtime.probe.v1" | "runtime.create.v1" | "runtime.inspect.v1"]
    | [
        "runtime.probe.v1" | "runtime.create.v1" | "runtime.inspect.v1",
        "runtime.probe.v1" | "runtime.create.v1" | "runtime.inspect.v1"
      ]
    | [
        "runtime.probe.v1" | "runtime.create.v1" | "runtime.inspect.v1",
        "runtime.probe.v1" | "runtime.create.v1" | "runtime.inspect.v1",
        "runtime.probe.v1" | "runtime.create.v1" | "runtime.inspect.v1"
      ];
  error: Error | null;
  runtime: OwnedRuntimeReceiptV1 | null;
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

export interface OwnedRuntimeReceiptV1 {
  schemaVersion: "1.0";
  installationId: string;
  targetId: string;
  targetRevision: number;
  runId: string;
  workspaceId: string;
  operationId: string;
  requestDigest: string;
  handle: string;
  workspaceOperationId: string;
  workspaceReceiptDigest: string;
  recipe: RecipePin;
  namespace: string;
  bindingDigest: string;
  /**
   * @minItems 1
   * @maxItems 16
   */
  resources:
    | [RecipeResourceEvidence]
    | [RecipeResourceEvidence, RecipeResourceEvidence]
    | [RecipeResourceEvidence, RecipeResourceEvidence, RecipeResourceEvidence]
    | [RecipeResourceEvidence, RecipeResourceEvidence, RecipeResourceEvidence, RecipeResourceEvidence]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ];
  cleanup: RecipeDisposalDeclaration;
  /**
   * @minItems 1
   * @maxItems 16
   */
  evidenceRefs:
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ];
}
export interface RecipePin {
  id: string;
  version: string;
  digest: string;
}
export interface RecipeResourceEvidence {
  name: string;
  type: string;
  locator: string;
  state: "ready";
}
export interface RecipeDisposalDeclaration {
  actionId: string;
  actionVersion: string;
  trigger: string;
}
