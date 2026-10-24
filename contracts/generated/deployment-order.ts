/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface DeploymentOrderV1 {
  schemaVersion: "1.0";
  operationId: string;
  requestDigest: string;
  sequence: number;
  resourceKey: string;
  sourceRepositoryId: string;
  sourceSha: string;
  expectedPredecessor: string | null;
}
