/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface LabstrideExtensionManifestV1 {
  schemaVersion: "1.0";
  id: string;
  version: string;
  kind: "provider" | "connector" | "action" | "session-provider";
  protocol: {
    major: 1;
    minor: number;
  };
  entrypoint: string;
  /**
   * @minItems 1
   */
  capabilities: [string, ...string[]];
  /**
   * @minItems 0
   */
  requiredCapabilities: string[];
  /**
   * @minItems 0
   */
  permissions: (
    | "network.github"
    | "network.ssh"
    | "network.broker"
    | "filesystem.workspace"
    | "session.manage"
    | "workflow.dispatch"
  )[];
  inputSchema: string;
  outputSchema: string;
}
