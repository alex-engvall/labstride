# 28 — Durable coordinator store

W01.1 / [#14](https://github.com/alex-engvall/labstride/issues/14) introduces the first application persistence slice. It uses TypeScript, Node's built-in SQLite and a local durable state directory. It does not dispatch operations, authenticate provider inputs, claim effects or run a session adapter. Those boundaries remain W01.2–W01.4 and W02–W06 work.

## Entry points and trust

`startCoordinator(dataDir)` opens the actual store, migrates it and returns the coordinator, store and recovered snapshot. The core depends on the `StateStore`, `Clock` and `IdentityProvider` ports. Only the composition root imports SQLite; core has no filesystem/provider dependency. Optional clock/identity implementations belong to the trusted embedding application, never issue payloads or configuration URLs.

Run the bounded bootstrap inspector with `node apps/coordinator/main.ts /srv/labstride-state`. Supply an installation-owned absolute local path. The process prints a versioned JSON snapshot and exits without executing effects. This is not `labstride serve`, the authenticated operator CLI or an installed background service. Errors print a stable redacted code and return exit status 1. Snapshots contain operational metadata; callers must protect access.

The public core works without an agent, hooks, deployment credentials or a private package. It stores opaque session handles; it neither creates a session backend nor substitutes another client. Input adapters must authenticate and authorize requests before invoking the store and must supply credential references rather than secrets. Persisting an evidence reference records the trusted caller's observation, not independent proof of its truth.

## Persistence API

`commit(changes, context)` atomically applies up to 64 changes. A change contains a versioned lifecycle record, `expectedRevision` (null for creation) and an optional recovery flag. The context requires actor identity, a bounded reason and evidence references. Every successful change appends an audit snapshot in the same transaction. Runtime schemas and a 256 KiB per-record/audit limit apply before persistence. Payload validation never retrieves remote schemas.

`get(kind, id)` reads a validated record. `snapshot()` reads independent records in one database snapshot, keeping original identifiers. `history(runId)` reads related records and append-only audit under one read transaction. `close()` closes the database; restart reopens the same file rather than rebuilding identities from provider history.

The new [record](../schemas/lifecycle-record.schema.json) and [audit](../schemas/lifecycle-audit.schema.json) schemas version persisted data independently from the existing external v1 operation/session contracts. Generated TypeScript participates in the repository's type/drift checks. Ajv `8.20.0` and ajv-formats `3.0.1` are now pinned runtime dependencies (MIT); `@types/node` `24.19.2` and its locked undici-types dependency are development-only MIT dependencies. Packaging and clean-install qualification remain W07.

## Identity, transitions and recovery

Installation configuration revision, request provider/issue/generation, run repository/configuration, workspace ownership/locator/branch, operation request, deployment source/target, session enrollment and projection binding are stable. New configuration revisions use new installation snapshot identities. SQLite enforces request-generation uniqueness, one run per request, one live workspace per run, operation/intent linkage, session-provider/handle uniqueness and cross-run foreign keys. W01.3 still owns one active run per issue across generations and scheduling limits.

New records start at revision 1 and updates compare the previous revision in a write transaction. Lifecycle transitions follow the explicit tables in core; unlisted transitions fail. A run's `paused` flag is independent of its current phase and checkpoint. These are persisted facts, not implemented pause/cancel scheduling controls. Session state changes never change the run's state or grant plan approval.

Failed runs, errored workspaces and unknown outcomes require an explicit recovery change with evidence to change phase. Terminal operation/deployment/session outcomes and completed/cancelled runs cannot be rewritten through lifecycle transitions. A crossed operation effect boundary cannot be reset. A new operation and its original outbox descriptor must commit together; the store supplies no executor permission.

Recovery distinguishes `pendingIntents` for prepared, not-crossed operations from `reconciliationRequired` operations that are claimed, running or uncertain. All original descriptors remain in `records`, including those for terminal operations. Neither recovery list authorizes dispatch, proves a remote process stopped or supplies exactly-once execution. W01.2 owns claims, dispatch/retry timing and actual reconciliation.

## Resource retention and local path boundaries

Schema v2 adds an immutable resource inventory and evidence records for PR, merge, deployment, cleanup and corrections. Resources bind their creating operation, workspace, run and ownership reference. Evidence binds an operation/workspace/run, source and target identity, observed outcome and external reference. A verified cleanup record requires a tombstone reference. A correction appends another record referencing existing same-workspace evidence; it never rewrites the original. SQLite foreign keys and immutable-record triggers preserve those links after a workspace is marked deleted. There is no store method that deletes workspace metadata or resource history.

`startCoordinator(dataDir, { localWorkspaceRoots })` checks configured local roots before creating the state directory. The store resolves existing parents of paths that do not yet exist. At registration, update and every restart, recorded local workspace paths must remain disjoint from the state directory in both directions. Canonical aliases are resolved; dangling links and overlapping paths are rejected. Existing database, WAL, SHM and rollback-journal entries must be ordinary single-link files. Linked/unmanaged entries are preserved and rejected before SQLite opens them.

These checks assume an installation-owned local filesystem without an adversary replacing paths concurrently. They do not provide the target-side, race-resistant deletion/ownership/quiescence helper required in W03/W05. Opaque remote locators are metadata, not permission to resolve or delete a local path. The core performs no workspace deletion, hidden cleanup timer or metadata purge.

The [retention evidence](evidence/W01.1-retention-2026-10-21.md) exercises real removal of a test-created directory, retaining the run/resource/merge/deployment/cleanup graph and a separate directory. It does not pass the full target tombstone/lost-workflow-acknowledgement case AC20.

## SQLite and upgrade limits

The store enables foreign keys, WAL and `synchronous=FULL`, with a 5-second lock wait. Writes use `BEGIN IMMEDIATE`, bound values and atomic audit insertion. No network work is performed in transactions. A conflicting revision, reference or uniqueness constraint rolls the whole batch back. Audit update/delete triggers reject mutation. This is append-only application history, not tamper-proof storage against a database administrator.

Schema migrations have ordered versions and SHA-256 checksums. Migration DDL and version updates commit together. Schema v1 upgrades to v2 without changing existing identifiers or audit records. An unknown newer version, missing migration ledger or changed applied migration is rejected. A failed migration leaves previous schema/data intact. There are no automatic down migrations, database resets or retention deletions. The v1 executable rejects a v2 store: downgrade requires a forward fix or a deliberately restored compatible backup, followed by reconciliation before effects. Before an operator-led upgrade, pause effects and take a consistent SQLite backup; WAL-aware backup/restore qualification belongs to W06. Restoring an older file cannot authorize replay of external effects.

Tested runtime: Linux x86_64, Node `24.22.0`, linked SQLite `3.53.4`. Tests prove process-crash recovery, not power-loss durability, network filesystem support or multi-coordinator operation. See the [evidence and remaining acceptance boundaries](evidence/W01.1-lifecycles-2026-10-21.md).
