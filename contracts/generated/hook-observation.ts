/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface LabstrideHookObservation {
  schemaVersion: "1.0";
  eventId: string;
  providerId: string;
  runId: string;
  requestGeneration: number;
  workspaceId: string;
  sessionId: string;
  turnId: string | null;
  origin: "extension";
  kind: "session.ready" | "turn.started" | "turn.stopped" | "turn.interrupted" | "question.pending" | "session.closed";
  occurredAt: string;
  sourceVersion: string;
  /**
   * @maxItems 128
   */
  evidenceRefs: string[];
}
