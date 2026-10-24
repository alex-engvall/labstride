/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface ManagedCleanupObservationV1 {
  schemaVersion: "1.0";
  runId: string;
  workspaceId: string;
  sessionId: string;
  path: string;
  state: "idle" | "active" | "unknown";
  lastTurnId: string | null;
  observedAt: string;
}
