/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface SessionHandoff {
  schemaVersion: "1.0";
  id: string;
  runId: string;
  enrollmentId: string;
  expectedRunRevision: number;
  expectedSessionRevision: number;
  expectedLastTurnId: string | null;
  expectedHumanActivityRevision: number;
}
