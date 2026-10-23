import type { AuthorizationPolicy } from '../../contracts/generated/authorization-policy.ts';
import type { OperatorPolicyChange } from '../../contracts/generated/policy-change.ts';
import type { VerifiedRequestActorEvidence } from '../../contracts/generated/actor-evidence.ts';
import type { AuthorizationDecision } from '../../contracts/generated/authorization-decision.ts';
import type { RuleObservation } from '../configuration/rules.ts';

export type Policy = AuthorizationPolicy;
export type PolicyChange = OperatorPolicyChange;
export type ActorEvidence = VerifiedRequestActorEvidence;
export type Decision = AuthorizationDecision;
const authorities = new WeakSet<object>();
declare const localAuthority: unique symbol;
export type LocalPolicyAuthority = { readonly [localAuthority]: true };
// Bootstrap capability. Keep this reference in installation-owned code, outside
// workspace/extension/provider handlers. JSON and AuditContext cannot recreate it.
export function createLocalPolicyAuthority(): LocalPolicyAuthority {
  const authority = Object.freeze({}) as LocalPolicyAuthority;
  authorities.add(authority);
  return authority;
}
export function isLocalPolicyAuthority(value: unknown): value is LocalPolicyAuthority {
  return typeof value === 'object' && value !== null && authorities.has(value);
}
export interface PolicyDependencies {
  policyAuthority?: LocalPolicyAuthority;
  // Trusted adapter checks independent provider facts, not payload assertions.
  // Return null when actor/provenance cannot be established. No effects here.
  actorVerifier?: (observation: Readonly<RuleObservation>) => ActorEvidence | null;
}
