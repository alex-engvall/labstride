/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface QualifiedProviderFieldBinding {
  schemaVersion: "1.0";
  providerId: string;
  credentialRef: string;
  source: "project_v2" | "organization_issue_field" | "native_issue" | "label" | "issue_form";
  scopeId: string;
  fieldId: string;
  type: "string" | "boolean" | "number" | "date" | "single-select" | "multi-select";
  /**
   * @maxItems 1024
   */
  optionIds: string[];
  operators: ("equals" | "notEquals" | "contains" | "exists" | "changedTo")[];
  readable: boolean;
  writable: boolean;
  history: boolean;
  actorAttribution: boolean;
  /**
   * @minItems 1
   * @maxItems 128
   */
  evidenceRefs: [string, ...string[]];
}
