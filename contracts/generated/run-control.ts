/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface RunControl {
  schemaVersion: "1.0";
  id: string;
  runId: string;
  expectedRevision: number;
  command: "pause" | "resume" | "cancel";
}
