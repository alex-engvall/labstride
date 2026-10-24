/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface ManagedSessionStartV1 {
  schemaVersion: "1.0";
  runId: string;
  workspaceId: string;
  configDigest: string;
  receiptDigest: string;
  sourceSha: string;
  path: string;
  mode: "plan" | "default" | "none";
  model: string;
  reasoning: string;
  choices: {
    aiMode: string;
    model: string;
    reasoning: string;
  };
}
