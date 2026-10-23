/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface CodexQuestionObservation {
  schemaVersion: "1.0";
  sessionId: string;
  turnId: string;
  requestId: string | number;
  itemId: string;
  /**
   * @maxItems 128
   */
  questionIds: string[];
  status: "pending" | "resolved";
}
