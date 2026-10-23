/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface GitHubIssueFieldProfile {
  schemaVersion: "1.0";
  repositoryId: string;
  repository: string;
  workflow: string;
  targetId: string;
  rootId: string;
  sourceRoot: string;
  fields: {
    request: AdditionalProperties;
    aiMode: AdditionalProperties;
    model: AdditionalProperties;
    reasoning: AdditionalProperties;
    session: AdditionalProperties;
    path: AdditionalProperties;
  };
  runtimeValues: {
    aiMode: {
      [k: string]: string;
    };
    model: {
      [k: string]: string;
    };
    reasoning: {
      [k: string]: string;
    };
  };
}
export interface AdditionalProperties {
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
}
