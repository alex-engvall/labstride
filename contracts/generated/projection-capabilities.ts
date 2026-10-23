/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface ProjectionWriteCapabilities {
  schemaVersion: "1.0";
  mode: "atomic" | "checked" | "unsupported";
  durableWriteIdentity: boolean;
}
