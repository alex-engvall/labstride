/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export type LabstrideVersionV1 = {
  schemaVersion: "1.0";
  source: "release" | "development";
  installedRevision: string | null;
  nodeVersion: string;
} & (
  | {
      source?: "release";
      installedRevision?: string;
      [k: string]: unknown;
    }
  | {
      source?: "development";
      installedRevision?: null;
      [k: string]: unknown;
    }
);
