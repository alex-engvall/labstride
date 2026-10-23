/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface SessionBinding {
  schemaVersion: "1.0";
  enrollmentId: string;
  runId: string;
  workspaceId: string;
  providerId: string;
  sessionId: string;
  backendIdentity: string;
  profileDigest: string;
  status: "attached" | "detached";
}
