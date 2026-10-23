/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface AuthorizationPolicy {
  schemaVersion: "1.0";
  installationId: string;
  /**
   * @maxItems 256
   */
  actorIds: string[];
  /**
   * @maxItems 256
   */
  repositories: {
    id: string;
    name: string;
  }[];
  /**
   * @maxItems 256
   */
  grants: {
    repositoryId: string;
    targetId: string;
    actionId: string;
    actionVersion: string;
    /**
     * @minItems 1
     * @maxItems 256
     */
    effects: ["execute" | "cancel", ...("execute" | "cancel")[]];
  }[];
}
