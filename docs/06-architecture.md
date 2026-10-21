# 06 — Architecture

## Runtime

One Node.js coordinator process owns one SQLite database on a local durable filesystem. A CLI uses a local authenticated control socket/API. The coordinator exposes only configured authenticated HTTPS integration endpoints, not a dashboard. A reverse proxy or private-network route is deployment configuration; no control panel is required.

## Adopted hybrid

The coordinator is the durable execution owner. GitHub remains the task/decision interface, GitHub Actions remains the repository-owned execution and CI system, and an optional session adapter manages interactive agent work. [ADR-006](adr/0006-hybrid-coordination.md) explains why an Actions-only or hooks-only design does not replace recovery.

| Authority | Owned facts |
| --- | --- |
| GitHub issue/Project | Task, acceptance criteria, priority and authorized human requests/decisions |
| Coordinator/SQLite | Request generation, operation intent/claim, workspace/session identity, retry timing and recovery history |
| Session backend and target | Actual agent activity, human interaction, repository/workspace observations |
| GitHub checks/workflows and deployment target | Current-revision check results, workflow identity and actual deployed revision/health |

Only the coordinator's projection adapter writes managed technical progress fields and summaries to GitHub. Hooks, CLI controls and workflow receipts enter through validated inputs; they do not bypass policy or independently write competing projections. Human-owned fields are preserved. Observable facts are refreshed from their authoritative provider before completion or another privileged effect.

Begin the pilot with bounded outbound polling/reconciliation for GitHub requests and results. Webhooks may reduce latency where supported; they never replace reconciliation. Enable the authenticated workflow claim/receipt route only after its preflight gate passes. No public agent listener or inbound webhook is required merely to read Project state.

The domain layer depends on ports: state store, clock, identity provider, event source, projection writer, connector, action executor and session provider. GitHub, SSH, filesystem/process execution and optional agent implementations are adapters. Package boundaries must prevent imports from the core into provider implementations.

```mermaid
flowchart TD
  GH["GitHub fields and events"] --> AD["GitHub adapter"]
  AD --> CO["Coordinator and policy"]
  CO <--> DB["SQLite state and outbox"]
  CO --> EX["Extension operations"]
  EX --> WF["GitHub workflows"]
  EX --> AG["Optional agent"]
  WF --> SSH["SSH workspace target"]
  WF --> DP["Deployment target"]
  AG --> SSH
  AG -. "optional observations" .-> CO
  CO --> AD
  AD --> GH
```

The diagram shows responsibilities, not mandatory network paths. A workflow may deploy to a cloud service while its related source workspace resides on SSH.

## Package layout and implemented persistence

packages/core, packages/contracts, packages/storage-sqlite, packages/provider-github, packages/connector-ssh, packages/action-github-workflow, packages/action-workspace-create, packages/action-workspace-delete; apps/coordinator and apps/cli. Packages begin in one public repository. The private agent implementation is a separate repo consuming released/pinned contracts.

W01.1 implements `packages/core`, `packages/storage-sqlite` and the bounded `apps/coordinator` bootstrap; see [the durable store contract](28-durable-coordinator-store.md). Other package responsibilities below remain planned.

These are code boundaries, not separately deployed services. Ship the CLI and coordinator together. Implement storage and extension boundaries only as needed by the first complete slice; the logical persistence model below does not require building every subsystem before demonstrating recovery. The public core must run without an agent or hook runtime.

## Processing loop

1. Authenticate an incoming event or fetch it through a configured reconciliation adapter.
2. Persist a bounded normalized event and delivery identity before acknowledging it.
3. Refresh current external state where required; evaluate actor, repository, target and rule permissions.
4. In a transaction, create/update the run and enqueue operation intents and projection intents.
5. Execute committed intents outside the database transaction.
6. Persist observation/receipt and an append-only transition event; enqueue follow-up work.

Hook delivery follows this same observation path. Accept bounded, versioned observations with session/run identity and deduplication information; preserve pending GitHub projections in the outbox. Late/duplicate events cannot regress a newer generation, human decision or independently verified result. Missing hooks are discovered through provider observation and reconciliation, not interpreted as success or as permission to start another session. Provider-specific hook payloads require a reviewed normalization contract in W00; this document does not add an implemented hook API.

Network requests must not hold SQLite transactions. Use uniqueness constraints rather than in-memory checks to deduplicate. Outbox completion records survive process death. Secrets never enter event payloads or outbox arguments.

## Persistence model

| Table | Key information and constraints |
| --- | --- |
| installations | ID, schema/config revision, enabled state |
| bindings | Provider IDs, scope, field/type/option bindings, last resolution |
| events | Provider delivery ID or reconciliation fingerprint, actor, origin, source revision |
| requests | Provider issue ID, start transition generation; unique installation/issue/generation |
| runs | Request, state/version, config hash, source refs, current operation |
| workspaces | Run, target, resource locator, ownership proof reference, keep, lifecycle |
| resources | Workspace, resource type, provider ID, createdByOperation, cleanup policy |
| operations | Stable ID, action/version, canonical input hash, state, effect boundary |
| attempts | Operation, executor/run/attempt identity, timestamps, result/error |
| claims | Operation plus resource/target lock, fencing number, executor; unique active claim |
| sessions | Opaque extension/session ID, workspace, latest observed turn, owner state |
| approvals | Plan hash/revision, approving human ID, message/evidence reference |
| outbox | Intent, idempotency key, retry timing and last classified result |
| projections | Field ID, last observed/written value and expected version/fingerprint |
| audit | Actor, authorized operation, policy revision, transition and evidence IDs |

Use foreign keys, migrations, UTC timestamps, monotonic versions, checked enum values and bounded JSON where extension-specific data is needed. Keep operational history outside disposable workspace directories.

## Technical design defaults

Single coordinator, a conservative configurable workspace limit, one active automation turn per session, one deploy per target environment, exponential backoff with jitter for transient reads, and 90-day metadata retention are initial design defaults rather than user-specified product constants. Development capacity and CI/review capacity are distinct installation policies; no pilot-specific column limit is hardcoded in core. Limits must be visible through CLI diagnostics.

SQLite is not a network-shared coordination service. A future multi-coordinator mode requires another storage/locking design. WAL/checkpoint/backup behavior and process recovery need execution evidence in W01.
