/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface RuntimeCreateInputV1 {
  target: string;
  rootId: string;
  workspaceOperationId: string;
  recipe: RecipePin;
}
export interface RecipePin {
  id: string;
  version: string;
  digest: string;
}
