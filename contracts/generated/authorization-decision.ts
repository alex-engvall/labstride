/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface AuthorizationDecision {
  schemaVersion: "1.0";
  allowed: boolean;
  code:
    | "allowed"
    | "actor_unverified"
    | "actor_denied"
    | "repository_denied"
    | "operation_denied"
    | "policy_missing"
    | "policy_paused";
  policyRevision: number | null;
  actorId: string | null;
}
