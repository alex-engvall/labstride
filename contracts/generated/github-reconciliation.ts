/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface GitHubReconciliationStatus {
  schemaVersion: "1.0";
  key: string;
  installationId: string;
  providerId: string;
  scopeId: string;
  configDigest: string;
  revision: number;
  cursor: string | null;
  epoch: number;
  nextAt: string;
  attempts: number;
  lastError: string | null;
}
