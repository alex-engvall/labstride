import type { Policy, PolicyChange, LocalPolicyAuthority, ActorEvidence } from '../../packages/core/policy.ts';
import type { ConfigurationStore } from '../../packages/storage-sqlite/configuration.ts';
import type { AuditContext } from '../../packages/core/lifecycle.ts';

function policyTypes(store: ConfigurationStore, policy: Policy, change: PolicyChange, actor: ActorEvidence, audit: AuditContext) {
  // @ts-expect-error Audit metadata is not an operator capability.
  store.applyPolicyChange(change, audit, audit);
  // @ts-expect-error A serialized lookalike cannot construct an opaque capability.
  const forged: LocalPolicyAuthority = {};
  // @ts-expect-error Grants select only bounded execute/cancel effects.
  policy.grants[0].effects.push('shell');
  // @ts-expect-error Actor evidence cannot become a policy-change command.
  const command: PolicyChange = actor;
  void forged;
  void command;
}
void policyTypes;
