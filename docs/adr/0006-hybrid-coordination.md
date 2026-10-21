# ADR-006 — Durable hybrid with GitHub as the operator workspace

Date: 2026-10-21. Status: adopted design; implementation and live compatibility remain unverified.

## Context

The MVP must preserve independent workspaces, interactive session continuity, authorized delivery and safe cleanup across lost replies and process restarts. The operator proposed GitHub Actions for orchestration and agent hooks for updating GitHub. The open source design must also work with other installations and without private agent packages.

## Decision

Retain ADR-001's single TypeScript/Node.js coordinator and local durable SQLite store. Clarify ADR-004: GitHub owns task descriptions, acceptance criteria, priorities and authorized human intent. It is the shared visible progress surface; the coordinator retains execution records, not a competing editable planning system.

Use repository-owned GitHub Actions for build/test/package and approved delivery actions. Actions are not an always-running session supervisor or the authoritative workspace registry. Preserve ADR-003's authenticated claim and receipt protocol for privileged workflow operations. Do not replace it with a generic SSH command channel or grant the coding session deployment credentials.

Use the session-provider contract for start/resume/observe/send/interrupt/close. Codex is an initial compatibility target, not a core dependency. Optional Codex hooks report relevant observations to the coordinator. One projection adapter writes managed technical progress and summaries to GitHub; human-owned fields retain their existing authority and conflict handling.

Keep public workspace/deploy/cleanup functionality usable without hooks, a private extension, a specific hosting/control-panel product or the maintainer's personal agent authentication. Start with one distribution containing the CLI and a single coordinator process, one installation configuration and local SQLite. No service fleet, dashboard or new scheduler platform is introduced.

## Observation and recovery

Hooks are advisory input. Match the installed provider's supported events and map them to versioned, bounded observations with run/session/generation identity and deduplication data. A turn ending is not task completion; a session ending is not evidence that its workspace is safe to delete. A hook cannot grant plan approval, authorize merge/deploy, or replace current-revision CI and target checks.

Persist accepted observations and pending status writes before acknowledging them. On temporary GitHub failure, retain the projection intent for a bounded retry. Reconcile missing/late/duplicate hook reports using the actual session, workspace, workflow and target state. Never blindly repeat an uncertain effect. Hooks need not fire after an abrupt process failure and are not a complete audit or enforcement boundary.

Use bounded polling as the initial reliable observation path for personal Projects; add webhooks where supported. Project webhooks and Actions trigger coverage must be capability-checked separately. Scheduled Actions may be delayed or dropped and are not the only recovery mechanism. Workflow credentials and resulting workflow-trigger behavior must be verified independently from ordinary Project reads.

Do not put a general-purpose runner carrying deployment credentials inside an agent-writable workspace. A hook reporting identity is correlated with an enrolled session; it is not proof of a privileged execution outcome. Credential separation, trusted helper ownership and external completion checks remain mandatory.

## Alternatives considered

| Alternative | Advantage | Limitation for this MVP |
| --- | --- | --- |
| Actions-only control with direct hook writes | Familiar workflows and few named components | Durable session/workspace state, cross-run locks, missed-event recovery and projection conflicts still need an owner; personal Project triggers are not uniformly available |
| Coordinator implementing CI and delivery itself | Centralized execution | Rebuilds repository-native capabilities and broadens the privileged core |
| Durable hybrid | Uses GitHub's native workflow tools while retaining explicit recovery and interactive ownership | Requires installing and maintaining one small coordinator and its database |

## First proof and sequence

1. W00 records repository/Project permissions, provider versions, hook availability and the actual interactive client's session-backend capabilities. Use synthetic probes for workflow identity and the broker route.
2. W01 proves committed intent and original operation identity survive real process death. Its session fixtures reject stale human/turn revisions and report unsupported atomic guards.
3. Once those prerequisites pass, W02/W03 plus the separately installed agent adapter prove one owned test issue creates one isolated workspace and uses a session that the existing interactive client can resume. Do not silently replace the client's backend with a second independent daemon.
4. Exercise duplicate start, connection loss, dropped hook reports, failed GitHub writes, coordinator restart and human takeover. Reuse the same recorded resources; preserve uncertain outcomes and human edits. See AC35 and AC36 in the [acceptance cases](../acceptance-cases.json).
5. Expand current-revision CI/delivery, cleanup, operations and public installation only after these boundaries have evidence. The full MVP acceptance scope remains required; a small first slice does not waive later requirements.

## Compatibility and migration

This refines ADR-001 through ADR-005 and preserves stable requirement, work-package and issue identities. No existing runtime or database migration is claimed: the repository is still a specification. Existing event/session envelopes remain proposed contracts; hook-specific normalization is an open W00 deliverable, not a newly working endpoint.

Installation-specific credentials, hostnames and paths remain outside public examples. Requirement statuses stay planned and acceptance cases stay not_run until actual execution evidence exists. Source references are in [sources and evidence](../17-sources.md).

Subsequent scoped discovery is recorded in the [W00.3 capability matrix and closeout](../evidence/W00.3-discovery-closeout-2026-10-21.md): it completes the contract foundation and selects an initial hooks-disabled profile while retaining the atomic-guard and live-continuity gates. This does not change the hybrid decision or pass its runtime acceptance cases; current requirement statuses live in the canonical backlog.
