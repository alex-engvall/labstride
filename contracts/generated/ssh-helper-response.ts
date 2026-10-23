/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export type TrustedTargetHelperResponseV1 = {
  schemaVersion: "1.0";
  requestId: string;
  installationId: string;
  targetId: string;
  targetRevision: number;
  method: "probe" | "reserve" | "inspect";
  outcome: "ok" | "error" | "outcome_unknown";
  reservation: TargetRegistryReservationV1 | null;
  /**
   * @maxItems 3
   */
  capabilities:
    | []
    | ["target.probe.v1" | "target.reserve.v1" | "target.inspect.v1"]
    | [
        "target.probe.v1" | "target.reserve.v1" | "target.inspect.v1",
        "target.probe.v1" | "target.reserve.v1" | "target.inspect.v1"
      ]
    | [
        "target.probe.v1" | "target.reserve.v1" | "target.inspect.v1",
        "target.probe.v1" | "target.reserve.v1" | "target.inspect.v1",
        "target.probe.v1" | "target.reserve.v1" | "target.inspect.v1"
      ];
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

export interface TargetRegistryReservationV1 {
  schemaVersion: "1.0";
  installationId: string;
  targetId: string;
  targetRevision: number;
  runId: string;
  workspaceId: string;
  operationId: string;
  requestDigest: string;
  rootId: string;
  locator: string;
  state: "reserved";
}
