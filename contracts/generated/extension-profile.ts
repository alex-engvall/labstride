/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface RunExtensionProfile {
  schemaVersion: "1.0";
  runId: string;
  configRevision: string;
  pin: InstalledExtensionPin;
  protocol: NegotiatedProtocol;
  /**
   * @maxItems 128
   */
  capabilities: string[];
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
export interface NegotiatedProtocol {
  major: 1;
  minor: number;
}
