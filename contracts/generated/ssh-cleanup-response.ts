/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface TrustedCleanupInspectionResponseV4 {
  schemaVersion: "4.0";
  requestId: string;
  installationId: string;
  targetId: string;
  targetRevision: number;
  method: "inspect";
  inspection: CleanupInspectionV1 | null;
  outcome: "ok" | "outcome_unknown";
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
