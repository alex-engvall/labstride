/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export type LabstrideHookAcknowledgement =
  | {
      schemaVersion: "1.0";
      eventId: string;
      outcome: "accepted";
      persistence: "durable";
      observationId: string;
      error: null;
    }
  | {
      schemaVersion: "1.0";
      eventId: string;
      outcome: "duplicate";
      persistence: "durable";
      observationId: string;
      error: null;
    }
  | {
      schemaVersion: "1.0";
      eventId: string;
      outcome: "rejected";
      persistence: "not_stored";
      observationId: null;
      error: Error;
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
