/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export type Condition =
  | {
      field: string;
      op: "equals" | "notEquals" | "contains" | "changedTo";
      value: FieldValue;
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
/**
 * @maxItems 1024
 */
export type FieldValue = string | number | boolean | null | string[];
export type InputBinding =
  | (string | number | boolean | null)
  | InputBinding[]
  | {
      [k: string]: InputBinding;
    }
  | {
      binding: "field";
      field: string;
      mapping?: {
        [k: string]: string;
      };
    }
  | {
      binding: "context";
      context: "source" | "mergeSha" | "workspaceId";
    }
  | {
      binding: "literal";
      value: JsonValue;
    };
export type JsonValue =
  | {
      [k: string]: JsonValue;
    }
  | JsonValue[]
  | string
  | number
  | boolean
  | null;

export interface LabstrideInstallationConfigurationV1 {
  schemaVersion: "1.0";
  installationId: string;
  enabled: boolean;
  broker:
    | {
        enabled: false;
      }
    | {
        url: string;
        oidcAudience: string;
        enabled?: true;
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
      /**
       * Opt in to disjoint managed progress values on a single-select request field; controls remain human-owned.
       */
      allowManagedProgress?: boolean;
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
    development?: number;
    ciReview?: number;
    maxRepairs?: number;
    unattendedMs?: number;
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
          [k: string]: InputBinding;
        };
      },
      ...{
        id: string;
        action: string;
        inputs: {
          [k: string]: InputBinding;
        };
      }[]
    ];
  };
  /**
   * @minItems 0
   */
  projections: ({
    [k: string]: unknown;
  } & {
    fact: string;
    field: string;
    value?: FieldValue;
    valueFrom?:
      | {
          kind: "workspace-source-path";
          targetId: string;
          rootId: string;
          rootPath: string;
        }
      | {
          kind: "session-id";
        };
  })[];
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
      enabledValues: [FieldValue, ...FieldValue[]];
      /**
       * @minItems 1
       */
      disabledValues: [FieldValue, ...FieldValue[]];
    };
  };
}
