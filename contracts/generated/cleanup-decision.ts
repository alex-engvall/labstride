/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface CleanupDecisionV1 {
  schemaVersion: "1.0";
  requestId: string;
  contextDigest: string;
  policyDigest: string;
  recoveryEpoch: number;
  observedAt: string;
  eligible: boolean;
  /**
   * @maxItems 64
   */
  blockers: string[];
  /**
   * @maxItems 128
   */
  evidenceRefs: string[];
  inspection: CleanupInspectionV1 | null;
  observations: {
    merge: {
      repositoryId: string;
      pullRequest: number;
      head: string;
      baseBranch: string;
      merged: boolean;
      mergeSha: string | null;
      mergedBy: number | null;
    } | null;
    /**
     * @maxItems 32
     */
    targets: IndependentTargetObservationV1[];
    /**
     * @maxItems 64
     */
    sessions: LabstrideSessionObservationV1[];
    managed: ManagedCleanupObservationV1 | null;
    keep: {
      bindingDigest: string;
      retained: boolean;
      observedAt: string;
    } | null;
  };
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
export interface LabstrideSessionObservationV1 {
  schemaVersion: "1.0";
  workspaceId: string;
  providerId: string;
  sessionId: string;
  state: "ready" | "busy" | "waiting_human" | "closed" | "failed" | "outcome_unknown";
  lastTurnId: string | null;
  humanActivityRevision: number;
  effectiveSettings: {
    [k: string]: unknown;
  };
  /**
   * @minItems 0
   */
  evidenceRefs: string[];
}
export interface ManagedCleanupObservationV1 {
  schemaVersion: "1.0";
  runId: string;
  workspaceId: string;
  sessionId: string;
  path: string;
  state: "idle" | "active" | "unknown";
  lastTurnId: string | null;
  observedAt: string;
}
