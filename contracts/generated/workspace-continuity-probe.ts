/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface OwnedWorkspaceContinuityProbeV1 {
  schemaVersion: "1.0";
  stateDirectory: string;
  repository: string;
  repositoryId: string;
  /**
   * @minItems 2
   * @maxItems 2
   */
  issueIds: [string, string];
  actorId: string;
  installationId: string;
  targetId: string;
  rootId: string;
  sourceRoot: string;
  codingUid: number;
  coordinatorUser: string;
  coordinatorUid: number;
  nodePath: string;
  probeScript: string;
  targetRegistry: string;
  sessionEnrollmentFile: string;
  connectorPin: InstalledExtensionPin;
  actionPin: InstalledExtensionPin;
  sessionActionPin: InstalledExtensionPin;
}
export interface InstalledExtensionPin {
  id: string;
  version: string;
  kind: "provider" | "connector" | "action" | "session-provider";
  integrity: string;
  artifactPath: string;
  configuration: {
    [k: string]: unknown;
  };
  /**
   * @maxItems 128
   */
  permissions: string[];
  /**
   * @maxItems 128
   */
  capabilities: string[];
}
