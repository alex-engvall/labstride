/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface AutomationContext {
  schemaVersion: "1.0";
  sessionGuard?: {
    enrollmentId: string;
    sessionId: string;
    expectedLastTurnId: string | null;
    expectedHumanActivityRevision: number;
  };
  repair?: {
    failureFingerprint: string;
  };
}
