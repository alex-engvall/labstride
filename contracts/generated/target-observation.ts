/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface IndependentTargetObservationV1 {
  schemaVersion: "1.0";
  observationId: string;
  targetId: string;
  environment: string;
  resourceId: string;
  sourceRepositoryId: string;
  sourceSha: string | null;
  health: "healthy" | "unhealthy" | "unknown";
  observedAt: string;
}
