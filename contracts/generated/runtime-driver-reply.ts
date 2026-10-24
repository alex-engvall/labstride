/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface RuntimeRecipeDriverReplyV1 {
  schemaVersion: "1.0";
  status: "ready" | "outcome_unknown";
  bindingDigest: string;
  /**
   * @maxItems 16
   */
  resources:
    | []
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
export interface RecipeResourceEvidence {
  name: string;
  type: string;
  locator: string;
  state: "ready";
}
