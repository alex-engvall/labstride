# 08 — Configuration and rule semantics

Configuration belongs to the operator. The initial authority is an installation-owned file plus a pinned revision of repository workflow/configuration files explicitly approved by the operator. Issue text, PR branches and agent output cannot modify this authority.

## Configuration lifecycle

Parse against config.schema.json, reject unknown core keys, resolve secrets by reference, resolve external IDs/types, validate extension compatibility and capabilities, and compile rule bindings. Produce a configuration digest and human-readable preflight report. Enable only after all required bindings resolve.

Every new run snapshots effective configuration and extension digests. Ordinary edits apply to new runs. Emergency deny/revoke/pause controls apply immediately to active runs and are audited. Expanding active-run permissions requires an explicit new authorized policy revision.

W02.1 implements the [compiler, typed bindings and transactional admission API](30-installation-configuration.md). Compilation accepts an explicit installed lock and trusted provider/secret interfaces; it inspects pinned artifacts without evaluating their modules. Failures report stable diagnostic codes/paths. The immutable snapshot includes qualified bindings and exact extension pins; activation and new-run admission remain trusted local embedding operations. W02.2 adds [request authorization, trusted policy changes and immediate restrictions](31-authorization-and-policy.md). W02.3 supplies [actual GitHub observation, generation allocation and checked projections](32-github-reconciliation.md), with explicit supported-history and remote race limits.

## Fields

Bind logical names such as request, status, model, reasoning or keep to any supported external field. A binding contains provider kind, container/project scope, field ID, data type and option IDs where applicable. Names are display hints only. Rename handling must keep stable IDs; deletion/type changes block the affected binding with a useful diagnostic.

Native issue fields, organization issue fields, Project fields, labels and form-body text are different sources. The adapter advertises each capability. Arbitrary values mean user-configurable typed mappings, not arbitrary code execution or support for every provider field type without an adapter.

Contract value types (each provider capability must be verified before enablement): string, boolean, number, date, single-select and multi-select; operators: equals, notEquals, contains, exists, changedTo, all, any, not. Unsupported provider/operator combinations fail validation. Compare null/missing distinctly; never coerce an unknown model option into the default silently.

Include credential/container, history coverage and actor-attribution limits in a binding's capability validation. The [personal-Project probe](evidence/W00.1-actor-observation-2026-10-21.md) recovered built-in Status events for public issue-backed items, but not an intermediate Priority transition. Current-state readability alone cannot validate a recoverable `changedTo` start rule on an arbitrary field. Timeline actor identity must pass configured authorization; User type, creator metadata and `wasAutomated=false` do not establish a human approval. Keep unsupported combinations disabled with an actionable reason rather than silently substituting another field, credential or request mechanism.

## Rules

Rules have an explicit event kind, typed condition and workflow reference. The referenced workflow contains ordered action steps with typed input bindings. Conflicting matching rules are rejected; rule ordering never silently grants precedence. Bindings draw only from validated fields, recorded context or trusted literals. No eval, shell interpolation, executable templates or user-supplied action URLs.

Evaluate a start rule on a qualifying transition, not continuously while the field retains the same value. The transition generation is persisted. Initial synchronization does not start old matching issues by default; the operator can deliberately import selected requests.

If multiple start rules match the same request with incompatible actions/targets, mark rule_conflict and perform no effects. Default one matching start rule; explicit ordered follow-up actions are allowed. Projection events carry origin markers and cannot satisfy a user-start rule.

The W02.1 evaluator conservatively rejects any multiple matching start rules, even if they reference the same workflow. Duplicate condition trees fail preflight; other overlaps fail at evaluation before scheduling. Each start branch requires a positive `changedTo` predicate. Missing observations block evaluation, confirmed absence is distinct from null, and unknown values never acquire truth through negation. Workflow steps keep typed bindings until their recorded context is available; full materialized inputs must pass the pinned schema before that step is scheduled.

## Authority and manual changes

GitHub owns task content, acceptance criteria, prioritization and authorized human intent, and displays progress. The coordinator owns durable execution identity/recovery records and refreshes observed facts from the relevant providers. This division avoids a second independently editable task backlog. Human changes to configured pause/keep controls are effective after authorization and refresh. A manual edit of a projected status is not an instruction to change execution state unless a separate rule explicitly makes it one.

Distinguish human delivery flow from technical execution progress where the installation uses both. Field names and stage values remain configurable. The coordinator's projection adapter is the single writer for managed technical fields/summaries; agent hooks and Actions report observations instead of directly competing for those fields. Status outputs cannot masquerade as human start or approval requests.

Before projection, refresh the current value. If it differs from the last observed/owned value, record projection_conflict rather than overwriting a human. Do not claim the provider has atomic compare-and-set unless verified. Reconcile races after writes. Discard late results from older run generations.

The GitHub adapter uses the explicitly accepted checked mode: durable attempt, immediate pre-read, mapped-field mutation and independent readback. It holds detected conflicts and retains lost acknowledgements as uncertain without replay. GitHub supplies no field CAS or durable write receipt, so an unobservable concurrent overwrite remains possible. Existing atomic adapters and session guards retain their stronger guarantees; see the [runtime contract](32-github-reconciliation.md).

Examples are structurally valid templates. Strings beginning REPLACE_ and hosts under example.invalid intentionally fail live preflight until resolved.
