/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface CodexAnswer {
  schemaVersion: "1.0";
  sessionId: string;
  turnId: string;
  requestId: string | number;
  answers: {
    /**
     * @minItems 1
     */
    [k: string]: [string, ...string[]];
  };
}
