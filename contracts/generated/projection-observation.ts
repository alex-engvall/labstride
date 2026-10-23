/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

/**
 * @maxItems 1024
 */
export type FieldValue = string | number | boolean | null | string[];

export interface ProjectionObservation {
  schemaVersion: "1.0";
  providerId: string;
  subjectId: string;
  fieldId: string;
  generation: number;
  version: string;
  value: FieldValue;
  appliedToken: string | null;
}
