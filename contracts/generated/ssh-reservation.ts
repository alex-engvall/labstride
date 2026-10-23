/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface TargetRegistryReservationV1 {
  schemaVersion: "1.0";
  installationId: string;
  targetId: string;
  targetRevision: number;
  runId: string;
  workspaceId: string;
  operationId: string;
  requestDigest: string;
  rootId: string;
  locator: string;
  state: "reserved";
}
