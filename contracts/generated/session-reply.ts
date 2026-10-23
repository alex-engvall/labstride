/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export type SessionProviderReply =
  | {
      schemaVersion: "1.0";
      outcome: "ok";
      observation: LabstrideSessionObservationV1;
    }
  | {
      schemaVersion: "1.0";
      outcome: "error";
      code: "stale_revision" | "unsupported_capability" | "identity_mismatch" | "validation_failed" | "forbidden";
      /**
       * @minItems 1
       * @maxItems 128
       */
      evidenceRefs: [string, ...string[]];
    }
  | {
      schemaVersion: "1.0";
      outcome: "outcome_unknown";
      /**
       * @minItems 1
       * @maxItems 128
       */
      evidenceRefs: [string, ...string[]];
    };

export interface LabstrideSessionObservationV1 {
  schemaVersion: "1.0";
  workspaceId: string;
  providerId: string;
  sessionId: string;
  state: "ready" | "busy" | "waiting_human" | "closed" | "failed" | "outcome_unknown";
  lastTurnId: string | null;
  humanActivityRevision: number;
  effectiveSettings: {
    [k: string]: unknown;
  };
  /**
   * @minItems 0
   */
  evidenceRefs: string[];
}
