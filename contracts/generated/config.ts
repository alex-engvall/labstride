/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export type Condition =
  | {
      field: string;
      op: "equals" | "notEquals" | "contains" | "changedTo";
      value: string | number | boolean | null;
    }
  | {
      field: string;
      op: "exists";
    }
  | {
      /**
       * @minItems 1
       */
      all: [Condition, ...Condition[]];
    }
  | {
      /**
       * @minItems 1
       */
      any: [Condition, ...Condition[]];
    }
  | {
      not: Condition;
    };

export interface LabstrideInstallationConfigurationV1 {
  schemaVersion: "1.0";
  installationId: string;
  enabled: boolean;
  broker: {
    url: string;
    oidcAudience: string;
  };
  github: {
    /**
     * @minItems 1
     */
    repositories: [string, ...string[]];
    /**
     * @minItems 1
     */
    actorIds: [string, ...string[]];
    credentialRef: string;
    projectCredentialRef: string;
    pollIntervalSeconds: number;
  };
  fields: {
    [k: string]: {
      source: "project_v2" | "organization_issue_field" | "native_issue" | "label" | "issue_form";
      scopeId: string;
      fieldId: string;
      type: "string" | "boolean" | "number" | "date" | "single-select" | "multi-select";
      options?: {
        [k: string]: string;
      };
    };
  };
  targets: {
    [k: string]: {
      connector: string;
      configuration: {
        [k: string]: unknown;
      };
    };
  };
  /**
   * @minItems 1
   */
  extensions: [
    {
      id: string;
      version: string;
      integrity: string;
    },
    ...{
      id: string;
      version: string;
      integrity: string;
    }[]
  ];
  limits: {
    activeRuns: number;
    perIssue: 1;
    perDeploymentTarget: 1;
    metadataRetentionDays: number;
  };
  /**
   * @minItems 1
   */
  rules: [
    {
      id: string;
      event: string;
      condition: Condition;
      workflow: string;
    },
    ...{
      id: string;
      event: string;
      condition: Condition;
      workflow: string;
    }[]
  ];
  workflows: {
    /**
     * @minItems 1
     */
    [k: string]: [
      {
        id: string;
        action: string;
        inputs: {
          [k: string]: unknown;
        };
      },
      ...{
        id: string;
        action: string;
        inputs: {
          [k: string]: unknown;
        };
      }[]
    ];
  };
  /**
   * @minItems 0
   */
  projections: {
    fact: string;
    field: string;
    value: string | number | boolean | null;
  }[];
  extensionConfiguration: {
    [k: string]: {
      [k: string]: unknown;
    };
  };
  controls: {
    [k: string]: {
      field: string;
      /**
       * @minItems 1
       */
      enabledValues: [string, ...string[]];
      /**
       * @minItems 1
       */
      disabledValues: [string, ...string[]];
    };
  };
}
