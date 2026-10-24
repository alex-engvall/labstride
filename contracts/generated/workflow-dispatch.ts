/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface WorkflowDispatchRecordV1 {
  schemaVersion: "1.0";
  operationId: string;
  requestDigest: string;
  enrollment: WorkflowEnrollmentV1;
  submittedAt: string;
  runId: string | null;
}
export interface WorkflowEnrollmentV1 {
  schemaVersion: "1.0";
  repository: {
    name: string;
    nodeId: string;
    id: string;
    ownerId: string;
  };
  workflowId: string;
  workflowPath: string;
  ref: string;
  workflowSha: string;
  targetId: string;
  environment: string;
  credentialRef: string;
  inputs: {
    [k: string]: string;
  };
  deployment?: DeploymentProfileV1;
}
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
