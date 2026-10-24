/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface EffectiveSafeConfigurationViewV1 {
  schemaVersion: "1.0";
  profile: "public" | "native-self-build";
  enabled: boolean;
  installationId: string;
  stateDirectory: string;
  revision: string;
  repositories: string[];
  credentialReferences: {
    repository: string;
    project: string;
  };
  pollIntervalSeconds: number;
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
    id: string;
    connector: string;
  }[];
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
  broker:
    | {
        enabled: false;
      }
    | {
        enabled: true;
        url: string | null;
        oidcAudience: string;
      };
  session:
    | {
        enabled: false;
        fallback: "provider_polling_and_operation_reconciliation";
      }
    | {
        enabled: true;
        backendIdentity: string;
        backendVersion: string;
        hooks: "disabled";
        atomicGuards: "unsupported";
        continuity: "requires_independent_client_evidence";
      };
}
