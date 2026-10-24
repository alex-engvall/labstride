/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface CleanupActionInputV1 {
  schemaVersion: "1.0";
  policy: CleanupPolicyV1;
  decisionId: string;
  workspaceId: string;
}
export interface CleanupPolicyV1 {
  schemaVersion: "1.0";
  trigger: "completion_verified" | "operator_request";
  actionId: string;
  actionVersion: string;
  completion: "merge_and_deployment" | "merge_only";
  /**
   * @maxItems 128
   */
  regenerableIgnoredPaths: string[];
}
