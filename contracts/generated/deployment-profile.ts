/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface DeploymentProfileV1 {
  schemaVersion: "1.0";
  recipe: {
    id: string;
    version: string;
    digest: string;
  };
  observer: {
    id: string;
    version: string;
    configuration: {
      [k: string]: unknown;
    };
  };
  maxObservationAgeMs?: number;
  observationTimeoutMs?: number;
  recovery: {
    /**
     * @minItems 1
     * @maxItems 4
     */
    methods:
      | ["manual" | "rollback" | "restore_backup" | "forward_fix"]
      | [
          "manual" | "rollback" | "restore_backup" | "forward_fix",
          "manual" | "rollback" | "restore_backup" | "forward_fix"
        ]
      | [
          "manual" | "rollback" | "restore_backup" | "forward_fix",
          "manual" | "rollback" | "restore_backup" | "forward_fix",
          "manual" | "rollback" | "restore_backup" | "forward_fix"
        ]
      | [
          "manual" | "rollback" | "restore_backup" | "forward_fix",
          "manual" | "rollback" | "restore_backup" | "forward_fix",
          "manual" | "rollback" | "restore_backup" | "forward_fix",
          "manual" | "rollback" | "restore_backup" | "forward_fix"
        ];
    /**
     * @minItems 1
     * @maxItems 32
     */
    steps: [string, ...string[]];
    migration: {
      strategy: "compatible" | "backup_restore" | "forward_fix" | "irreversible";
      /**
       * @minItems 1
       * @maxItems 32
       */
      limits: [string, ...string[]];
    };
    rollback: {
      supported: boolean;
      qualification: {
        recipeDigest: string;
        targetId: string;
        environment: string;
        /**
         * @minItems 1
         * @maxItems 32
         */
        evidenceRefs: [string, ...string[]];
      } | null;
    };
  };
}
