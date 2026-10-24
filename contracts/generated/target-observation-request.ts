/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface TargetObservationRequestV1 {
  schemaVersion: "1.0";
  observationId: string;
  targetId: string;
  environment: string;
  configuration: {
    [k: string]: unknown;
  };
}
