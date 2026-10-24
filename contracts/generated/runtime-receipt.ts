/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface OwnedRuntimeReceiptV1 {
  schemaVersion: "1.0";
  installationId: string;
  targetId: string;
  targetRevision: number;
  runId: string;
  workspaceId: string;
  operationId: string;
  requestDigest: string;
  handle: string;
  workspaceOperationId: string;
  workspaceReceiptDigest: string;
  recipe: RecipePin;
  namespace: string;
  bindingDigest: string;
  /**
   * @minItems 1
   * @maxItems 16
   */
  resources:
    | [RecipeResourceEvidence]
    | [RecipeResourceEvidence, RecipeResourceEvidence]
    | [RecipeResourceEvidence, RecipeResourceEvidence, RecipeResourceEvidence]
    | [RecipeResourceEvidence, RecipeResourceEvidence, RecipeResourceEvidence, RecipeResourceEvidence]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ]
    | [
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence,
        RecipeResourceEvidence
      ];
  cleanup: RecipeDisposalDeclaration;
  /**
   * @minItems 1
   * @maxItems 16
   */
  evidenceRefs:
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ];
}
export interface RecipePin {
  id: string;
  version: string;
  digest: string;
}
export interface RecipeResourceEvidence {
  name: string;
  type: string;
  locator: string;
  state: "ready";
}
export interface RecipeDisposalDeclaration {
  actionId: string;
  actionVersion: string;
  trigger: string;
}
