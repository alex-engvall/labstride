/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface ManagedCodingResultV1 {
  schemaVersion: "1.0";
  runId: string;
  sessionId: string;
  turnId: string;
  commitSha: string;
  status: "ready" | "blocked";
  summary: string;
  prTitle: string;
  prBody: string;
  issueComplete: boolean;
}
