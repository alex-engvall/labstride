# 29 — Installed extensions and durable sessions

W01.4 / #17 implements a local installed loading boundary and the generic session path. See the [local execution evidence](evidence/W01.4-installed-sessions-2026-10-23.md), [operator-authorized backend upgrade](evidence/W01.4-backend-upgrade-2026-10-23.md) and [actual enrolled-client continuity proof](evidence/W01.4-client-continuity-2026-10-23.md). The latter combines backend observations with the operator's explicit same-client resumption and settings confirmation; a matching backend version alone does not establish continuity. An installed service and general Codex account qualification remain outside this slice.

## Installed artifact boundary

An [artifact](../schemas/extension-artifact.schema.json) contains one manifest, one self-contained ESM source string and local JSON schemas. Its manifest entrypoint is `module`; `inputSchema` and `outputSchema` name entries in `schemas`, which must also contain `configuration`. Package dependencies must already be bundled into that module. Relative, absolute and external package module resolution from its namespace is rejected; Node built-ins remain available. Schemas may use local fragment references only. Remote schema retrieval is unavailable.

The [lockfile](../schemas/extension-lock.schema.json) binds an absolute installed artifact path, extension ID/version/kind, exact SHA-256, operator-reviewed configuration, selected capabilities and permissions. The loader rejects incompatible identity/protocol, altered bytes, ungranted permissions, missing capabilities and invalid configuration before evaluating extension code. It reads a bounded regular file through a no-follow descriptor and imports the verified in-memory bytes. No network install, npm invocation or upgrade is performed. Issue content and hook records have no code-loading authority.

These are trusted in-process extensions, not sandboxed code. The resolver restriction is a packaging contract, not confinement against malicious reviewed code using operating-system APIs. Native modules and unbundled package dependencies are outside the v1 artifact format. Packaging provenance, dependency notices and clean distribution installation remain W07 gates.

Package the public fixture or Codex example into a **new**, operator-owned output path:

```bash
node scripts/package_extension.mjs packages/session-fixture /tmp/fixture.artifact.json
node scripts/package_extension.mjs packages/session-codex /tmp/codex.artifact.json
```

The command prints the exact digest and refuses to overwrite an existing output. It packages independently authored source, without downloads or source rewriting. The [lockfile example](../examples/extension-lock.json) is a structural template: its zero digest must be replaced by the real package digest. The [artifact example](../examples/extension-artifact.json) illustrates the format, not an executable provider implementation.

## Frozen run profile and session identity

`freezeProfile` verifies an installed pin without importing it. `SessionStore.pinProfile` binds its [profile](../schemas/extension-profile.schema.json) to an existing run/configuration revision. A different profile for the same run/provider conflicts. The active run keeps its original version, configuration, negotiated protocol and capabilities across restart. Missing or changed original artifacts stop loading; changing the current lockfile cannot redirect a running session to another provider or backend.

Extensions export `createExtension(configuration)`. `sessionResolver` validates configuration before creating an instance, validates the provider's backend/capability declarations, then validates session requests, replies and public method envelopes. The typed `SessionProvider` port exposes validation, invocation and read-only reconciliation. Its method request selects start/resume/observe/send/interrupt/close; capability declarations must agree with the frozen profile. The provider-specific schema also validates inputs/settings.

The trusted embedding application schedules an ordinary `labstride.session-command` v1.0.0 operation/outbox with `bindCommand`, recalculates its request digest, and registers the exact immutable command through `registerSessionCommand`. Registration after scheduling is fail-closed: a worker encountering an unregistered descriptor cannot call the provider. Registration can be repeated to complete an interrupted setup. This API is trusted composition, not an issue-payload interpreter or an authenticated operator endpoint.

The [session binding](../schemas/session-binding.schema.json) retains enrollment/run/workspace/provider/session identity, backend identity and profile digest. Commands and backend receipts are associated with the original operation. A command's success means that command was observed; a busy or stopped session is not evidence that the task completed.

An uncertain invoke is never repeated. Reconciliation uses the same command identity and an authoritative provider receipt, or retains `outcome_unknown`. Unknown cached observations are re-observed; only definite saved receipts can satisfy a command without another backend read. The fixture has an independent SQLite ledger and atomic guard transaction. Codex has no equivalent operation receipt for uncertain send/interrupt/detach, so those remain unknown rather than being inferred from current state.

`startExecution` optionally accepts `installedSessions: { host, providerIds }`. It composes the session action and profile-bound observers into the existing workers and closes owned adapter resources on shutdown. It adds no listener, daemon, automatic scheduling timer or target provisioning.

## Human priority, hooks and handoff

Before send, the store checks the registered binding, expected local turn/human revision, automation ownership and holds. The frozen profile must advertise `session.atomic-guards.v1`; the loaded adapter's declaration must match. The provider must additionally enforce both preconditions atomically at its backend. A read followed by an unconditional write is insufficient.

Human observations retain the existing durable hold. `handoffSession` requires an evidence-bearing operator context, a [revision-bound handoff request](../schemas/session-handoff.schema.json), a fresh backend observation, a ready enrolled session and supported atomic guards. It cannot clear operator pause, cancellation, budgets or unresolved effects. Ordinary resume and hooks cannot perform this handoff.

Enrolled hooks require the frozen `session.hooks.v1` capability and an attached binding. The existing committed inbox, deduplication, backend observation and managed projection path remains authoritative. A hook cannot approve a plan, remove a human hold or verify task completion. Legacy unprofiled synthetic observation fixtures remain supported; they do not enable a real provider integration.

## Public Codex example

The example targets the inspected **0.163.0 backend protocol**, not merely that CLI binary version. It connects to a configured existing Unix-socket WebSocket endpoint; it never starts/restarts another daemon or copies a login. Socket forwarding, if needed, is an explicit operator transport outside core.

`start` enrolls the configured existing thread after metadata/workspace validation. `resume` sends only the same thread ID and metadata-only hydration option; it does not write model, effort, mode, permissions or global settings. History reads are bounded to the latest turn summary. Missing history cannot establish an empty, idle session. Observation revisions persist locally and increase when the observed turn identity changes; they are conservative observation tokens, not atomic backend human-activity revisions.

The initial profile disables hooks and atomic automated sends. Stale preconditions return `stale_revision`; otherwise send returns `unsupported_capability`, without `turn/start` or `turn/steer`. An unqualified backend version is rejected during effect-free validation, before the operation claim/effect boundary. An interrupt identifies the enrolled active turn. Close unsubscribes this adapter and detaches its local binding; it does not delete/archive the app chat or report permanent backend closure.

[Question](../schemas/codex-question.schema.json) and [answer](../schemas/codex-answer.schema.json) schemas bind session/turn/server-request/question identities. The adapter stores bounded IDs and resolution observations, excluding question text and answer contents. Conflicting duplicates are discarded and old-turn questions cannot override current facts. `correlateAnswer` rejects foreign, resolved or mismatched answers; it transmits nothing. The actual user answers in the existing app. Resolution can mean a request was cleared, not that an answer or approval was given. After disconnect, pending-question recovery requires backend reconciliation; the adapter never fabricates a replacement question or auto-answers.

## Explicit continuity probe

Prepare an operator-reviewed lockfile and [probe configuration](../examples/session-probe.json) for one owned test issue, existing isolated SSH workspace and explicitly selected disposable app session. The probe records operator-supplied associations; it does not verify GitHub authorization, create an SSH workspace or claim W02/W03 acceptance.

```bash
node scripts/probe_session.mjs /path/to/reviewed-probe.json start
node scripts/probe_session.mjs /path/to/reviewed-probe.json recover
node scripts/probe_session.mjs /path/to/reviewed-probe.json resume
node scripts/probe_session.mjs /path/to/reviewed-probe.json observe
```

Repeat start/recover to inspect original identities after loss of a reply or process restart. Resume and observe each use one durable phase operation; rerunning them inspects that original command. New observations continue through the regular observation worker. The tool retains workspace resources and always reports live acceptance as unverified. Actual client resumption, a human turn, question handling, connection loss and GitHub projection conflicts need correlated integration evidence; a successful command is not that evidence.

## Migration and recovery limits

Migration v9 adds profile, binding, command and handoff tables without fabricating pins for existing sessions or changing older migration checksums. Nested store work uses savepoints so session observation/binding/reply changes remain atomic. Existing legacy lifecycle records remain readable. New installed commands require explicit registration and enrollment.

Pause effects and take a consistent SQLite backup before upgrade. There is no automatic down migration. Restoring an older backup requires reconciliation of external effects; never delete a database or workspace to retry an uncertain command. Original artifacts must remain available for active profiles. Linux/Node 24.22.0 local evidence does not qualify Node 22, other platforms, power-loss recovery or a fresh public distribution.
