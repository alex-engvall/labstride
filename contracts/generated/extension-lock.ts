/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface ExtensionLock {
  schemaVersion: "1.0";
  /**
   * @minItems 1
   * @maxItems 128
   */
  extensions: [InstalledExtensionPin, ...InstalledExtensionPin[]];
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
