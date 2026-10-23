/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface OptInSessionContinuityProbeConfiguration {
  schemaVersion: "1.0";
  probeId: string;
  createdAt: string;
  dataDir: string;
  lockFile: string;
  providerId: string;
  backendIdentity: string;
  actorId: string;
  issueId: string;
  source: {
    repositoryId: string;
    repository: string;
    sha: string;
  };
  workspace: {
    id: string;
    targetId: string;
    locator: string;
    branch: string;
    ownershipRef: string;
  };
}
