/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface RunBudget {
  schemaVersion: "1.0";
  id: string;
  runId: string;
  expectedRevision: number;
  maxRepairs: number;
  unattendedMs: number;
}
