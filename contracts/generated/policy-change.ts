/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface OperatorPolicyChange {
  schemaVersion: "1.0";
  id: string;
  installationId: string;
  expectedRevision: number;
  change:
    | {
        kind: "publish";
        policy: AuthorizationPolicy;
      }
    | {
        kind: "bind_run";
        runId: string;
        policyRevision: number;
      }
    | {
        kind: "restrict";
        runId: string | null;
        paused: boolean;
        /**
         * @maxItems 256
         */
        actorIds: string[];
        /**
         * @maxItems 256
         */
        repositoryIds: string[];
        /**
         * @maxItems 256
         */
        targetIds: string[];
        /**
         * @maxItems 256
         */
        actions: {
          id: string;
          version: string;
        }[];
      };
}
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
