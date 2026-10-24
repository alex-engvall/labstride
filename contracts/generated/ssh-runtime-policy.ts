/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface TrustedRuntimeHelperPolicyV1 {
  schemaVersion: "1.0";
  installationId: string;
  targetId: string;
  targetRevision: number;
  helperUid: number;
  stateDir: string;
  /**
   * @minItems 1
   * @maxItems 64
   */
  recipes: [InstalledRuntimeRecipeV1, ...InstalledRuntimeRecipeV1[]];
}
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
