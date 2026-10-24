/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export type TrustedCleanupDeletionResponseV5 = {
  schemaVersion: "5.0";
  requestId: string;
  installationId: string;
  targetId: string;
  targetRevision: number;
  method: "prepare" | "inspect" | "commit" | "release";
  state: "blocked" | "fenced" | "prepared" | "moving" | "removing" | "deleted" | "released" | "outcome_unknown";
  /**
   * @maxItems 32
   */
  blockers: string[];
  preparation: CleanupPreparationV1 | null;
  tombstone: CleanupTombstoneV1 | null;
};

export interface CleanupPreparationV1 {
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
  inspection: CleanupInspectionV1;
  preparedAt: string;
}
export interface CleanupInspectionV1 {
  schemaVersion: "1.0";
  requestId: string;
  installationId: string;
  targetId: string;
  workspaceId: string;
  creationOperationId: string;
  receiptDigest: string;
  policyDigest: string;
  observedAt: string;
  /**
   * @maxItems 32
   */
  blockers: string[];
  counts: ProtectedContentCounts;
  remoteRefsDigest: string | null;
}
export interface ProtectedContentCounts {
  tracked: number;
  untracked: number;
  ignored: number;
  unpushed: number;
}
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
