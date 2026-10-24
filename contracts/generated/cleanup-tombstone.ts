/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface CleanupTombstoneV1 {
  schemaVersion: "1.0";
  installationId: string;
  targetId: string;
  targetRevision: number;
  workspaceId: string;
  creationOperationId: string;
  receiptDigest: string;
  operationId: string;
  requestDigest: string;
  policyDigest: string;
  directoryIdentity: {
    device: number;
    inode: number;
    mountId: number;
    uid: number;
  };
  deletedAt: string;
}
