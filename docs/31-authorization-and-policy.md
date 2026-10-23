# 31 — Request authorization and trusted policy changes

W02.2 / [#19](https://github.com/alex-engvall/labstride/issues/19) implements **LS-CFG-004** and **LS-GH-002** at the trusted coordinator embedding boundary. [Configuration semantics](08-configuration-and-rules.md) and [security boundaries](11-security-and-trust.md) remain normative. [Evidence](evidence/W02.2-authorization-2026-10-23.md) separates executable local coverage, a fresh live actor-denial probe and open integration gates. This is not a GitHub poller, network authentication endpoint or production workflow broker.

## Bootstrap authority and actor attribution

Installation-owned bootstrap code calls `createLocalPolicyAuthority()` once and passes that opaque reference as `StoreDependencies.policyAuthority` to `startCoordinator` or `startExecution`. Keep the reference outside workspace code, extension settings and provider handlers. `activateConfiguration(compiled, expectedRevision, audit, authority)` requires that exact enrolled reference. Configuration activation remains compiled, audited and idempotent.

`applyPolicyChange(change, authority, audit)` likewise requires the exact enrolled reference before validating or storing a change. An audit actor/reason/evidence list, serialized capability lookalike or separately created capability does not grant access. Configured run pause/resume/takeover/cancel and budget renewal also require the capability as their third argument. Existing unconfigured W01 fixtures remain trusted local embeddings; they are not externally callable authorization interfaces.

This capability is an in-process trust boundary for reviewed installation code, not a sandbox against malicious code already executing with coordinator privileges. Separate the coordinator account, credentials, configuration and database from agent/workspace code. Do not expose a generic invocation interface for store methods. Remote authentication belongs to the later explicit transport integration.

`StoreDependencies.actorVerifier` is a separately enrolled synchronous, read-only adapter. It receives a cloned normalized observation and returns validated [actor evidence](../schemas/actor-evidence.schema.json), or null. Return evidence only from independently established provider facts; never echo event assertions or use the authenticated viewer, item creator, `wasAutomated=false`, hook content or webhook signature as the field-change actor. A production adapter should use already refreshed trusted facts rather than perform network requests while holding a SQLite write transaction. W02.3 owns that refresh/history path and its ordering/bootstrap guarantees.

Evidence binds installation, provider, external event, subject, stable actor ID, stable repository ID and configured repository name, configuration digest, request generation and observation digest. `authorizationObservationDigest` normalizes only local acquisition time to the recorded occurrence time. All other observation content remains bound. Evidence requires provenance references. Missing, malformed, unavailable or mismatched evidence denies admission. Evidence is returned by enrolled code; a caller cannot submit it as a permission-bearing request field.

## Policy publication and emergency controls

The [policy schema](../schemas/authorization-policy.schema.json) contains an installation, actor allowlist, repository ID/name pairs and grants for an exact repository ID, target ID and installed action ID/version. Each grant explicitly allows `execute`, `cancel`, or both. No wildcard, arbitrary module, shell command or issue-supplied action selector exists. An empty actor/grant list deliberately grants nothing. Configuration repository/actor restrictions and immutable extension pins still apply; a policy cannot bypass snapshot checks or platform protections.

[Operator changes](../schemas/policy-change.schema.json) use a unique ID and `expectedRevision`. The installation's monotonic revision advances for each committed change:

- `publish`: append an immutable, digest-checked policy and select it for new requests. Existing runs retain their original policy and configuration snapshot. Reductions that must affect active work use emergency restrictions instead of relying on ordinary publication.
- `bind_run`: explicitly authorize an existing, nonterminal, already authorized run to use a recorded policy revision from the same installation. It retains the original initiating actor and configuration snapshot. New rights remain bounded by that snapshot; policy publication alone cannot expand an active run. Migrated runs with no authorization are not adopted automatically.
- `restrict`: replace the emergency restriction set for the installation (`runId:null`) or one owned run. Restrictions include pause and denied actors, repositories, targets and exact action versions. Both scopes apply cumulatively. Clearing a restriction requires another authorized change; ordinary run resume, configuration activation and policy publication cannot clear it.

Change validation, CAS, policy/override/run binding updates, immutable change receipt and audit commit in one SQLite transaction. Repeating an identical change ID returns its original receipt even after later revisions or restart. Changed content/audit under the same ID conflicts. `policyStatus`, `policyRevision` and `policyHistory` expose current revisions and ordered operator changes without secret material.

## Admission and execution

`requestConfiguredStart` retains its W02.1 signature, with an added `authorization` decision in its receipt. The caller's `AuditContext` records intent but cannot authenticate it. Before invoking the reviewed plan builder, admission verifies attribution and the actor/repository policy. It checks the concrete bounded operation after binding the first step, before writing executable records. The operation source ID must match the run's repository ID and its target must match the workspace target.

A denied matching request records `blocked / authorization_denied` and a [decision](../schemas/authorization-decision.schema.json), with no request, run, workspace, operation, outbox or delivery. The original inbox/decision is durable. Duplicate events return their original receipt, including historical denials or admissions; policy changes never convert a duplicate into a new request. Nonmatching, historical and invalid rule evaluations remain inert. Old pre-W02.2 receipts may have `authorization:null`; that is absent evidence, not a grant.

Configured `scheduleStart` cannot bypass admission by supplying an allowed audit actor and a valid snapshot. Its plan must match the ephemeral admission scope created inside the authorized transaction. The run's actor and policy revision are stored with its original configuration snapshot. Follow-up scheduling, claims and `beginEffect` read that durable binding and the latest emergency restrictions. `operationAuthorization` exposes the current decision independently of the historical admission receipt. Session actions use the same operation boundary.

Cancellation is a separate privileged effect and requires the exact grant's `cancel` permission at `beginCancellation`. Revoking a target or action can block cancellation as well as start. Cancellation requests do not prove external cancellation; preserve the original handle and independently observe the outcome. Read-only reconciliation, session observation, historical receipts and policy audit continue after revocation. Targeted action revocations can still be reported through pinned technical projections; emergency pause blocks new projection writes as well. Existing human-edit/generation protection remains in force.

The linearization point is the committed effect boundary. A revocation committed before it blocks the effect, including one with an existing claim. It cannot undo an effect whose boundary already committed, interrupt arbitrary installed code atomically, or prove remote rollback. Production executors must preserve that boundary and perform their target-specific guarded checks. Unknown/crossed effects retain their identity and reconcile; lifting a restriction never authorizes an automatic replay.

Hooks retain the existing strict observation schema, enrollment correlation and independent provider refresh. They cannot publish policy, bind a run, approve a plan, declare release completion or invoke another privileged effect.

## Migration and verification limits

Migration v11 appends policy revisions/state, change receipts, run authorizations, emergency restrictions and immutable authorization decisions. It preserves migration v1–v10 checksums and existing run/operation/session identities. Existing configured v10 runs acquire no invented actor or policy grant: new effects block while their records remain readable. There is no automatic down-migration or policy bootstrap for such runs.

Before upgrading an installation, pause effects and take a consistent backup. Restore requires reconciling external effects completed since that backup. Retain snapshots and extension artifacts required by active runs. Reverting source alone does not restore an older database contract.

The live proof uses a fresh actor-bearing GitHub Status event through the actual admission APIs, with a local probe adapter and an explicit test generation. Other compiler bindings/actions are fixtures; no workspace or deployment is started. It does not qualify minimal credentials, continuous polling, ordering, production OIDC claims, SSH root enforcement or the full AC35 scenario. Full AC03/AC23/AC35 retain the integration gates stated in the evidence report.
