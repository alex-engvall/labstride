/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface InstalledExtensionInspectionV1 {
  schemaVersion: "1.0";
  extensions: {
    id: string;
    version: string;
    kind: "provider" | "connector" | "action" | "session-provider";
    integrity: string;
    capabilities: string[];
    permissions: string[];
    ok: boolean;
    code: string;
  }[];
}
