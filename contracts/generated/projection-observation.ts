/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface ProjectionObservation {
  schemaVersion: "1.0";
  providerId: string;
  subjectId: string;
  fieldId: string;
  generation: number;
  version: string;
  value: string | null;
  appliedToken: string | null;
}
