/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface RevisionComparisonV1 {
  schemaVersion: "1.0";
  repositoryId: string;
  baseSha: string;
  headSha: string;
  relation: "identical" | "ahead" | "behind" | "diverged";
}
