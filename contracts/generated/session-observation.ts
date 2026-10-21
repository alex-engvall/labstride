/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

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
