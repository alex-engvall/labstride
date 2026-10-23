/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export type LabstrideSessionCommandV1 = {
  schemaVersion: "1.0";
  operationId: string;
  workspaceId: string;
  providerId: string;
  command: "start" | "resume" | "observe" | "send" | "interrupt" | "close";
  sessionId: string | null;
  expectedLastTurnId: string | null;
  expectedHumanActivityRevision: number;
  input: {
    [k: string]: unknown;
  };
};

export interface RegisteredSessionCommand {
  schemaVersion: "1.0";
  enrollmentId: string;
  backendIdentity: string;
  profileDigest: string;
  request: LabstrideSessionCommandV1;
}
