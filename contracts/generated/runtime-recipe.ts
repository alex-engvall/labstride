/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface InstalledRuntimeRecipeV1 {
  id: string;
  version: string;
  driver: ProtectedRecipeDriver;
  configuration: {
    [k: string]: unknown;
  };
  /**
   * @minItems 1
   * @maxItems 16
   */
  resources:
    | [ResourceSlot]
    | [ResourceSlot, ResourceSlot]
    | [ResourceSlot, ResourceSlot, ResourceSlot]
    | [ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot]
    | [ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot]
    | [ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot]
    | [ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot]
    | [ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot]
    | [
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot
      ]
    | [
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot
      ]
    | [
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot
      ]
    | [
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot
      ]
    | [
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot
      ]
    | [
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot
      ]
    | [
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot
      ]
    | [
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot
      ];
  cleanup: RecipeDisposalDeclaration;
  timeoutMs: number;
}
export interface ProtectedRecipeDriver {
  path: string;
  integrity: string;
}
export interface ResourceSlot {
  key: string;
  type: string;
}
export interface RecipeDisposalDeclaration {
  actionId: string;
  actionVersion: string;
  trigger: string;
}
