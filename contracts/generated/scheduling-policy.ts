/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface SchedulingPolicy {
  schemaVersion: "1.0";
  activeRuns: number;
  development: number;
  ciReview: number;
  maxRepairs?: number;
  unattendedMs?: number;
}
