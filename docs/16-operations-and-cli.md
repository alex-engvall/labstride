# 16 — Operations and CLI

## CLI scope

The bounded [local issue-to-review profile](37-local-self-build.md) implements the JSON CLI, disabled administrative bootstrap and locked service loop. The table below retains the full command targets; keep/release, extension inspection, automated restore/upgrade and complete broker diagnostics remain open.

## Full command targets

| Command | Intended outcome |
| --- | --- |
| labstride init | Produce disabled installation template with no embedded credentials |
| labstride config validate | Validate schemas and produce a resolved binding report |
| labstride doctor | Check DB, credentials, provider capabilities, SSH and broker reachability |
| labstride serve | Run coordinator with configured persistent state |
| labstride runs list/show | Explain current phase, blocking reason and evidence |
| labstride runs pause/resume/cancel | Apply authenticated control intent and report actual state |
| labstride runs reconcile | Re-observe a run without blindly replaying effects |
| labstride workspaces keep/release | Set or remove cleanup hold with audit |
| labstride extensions inspect | Report pinned versions, capabilities and integrity |
| labstride backup/restore | Controlled consistent backup and recovery workflow |

Commands should offer human-readable output plus versioned JSON and stable exit codes. No command implies success when only an asynchronous request was accepted.

## Installation

Select a dedicated service identity and durable local state directory. Configure repositories/targets and references to credentials. Enroll host keys. Bind the control API locally. Configure authenticated HTTPS integration ingress or a private network route for runner claims; verify it before enabling workflows. Resolve field IDs and run dry validation first.

The intended distribution contains the CLI and one coordinator service, with one installation configuration and local SQLite; package boundaries are not a fleet of services. Start GitHub observation with bounded outbound polling, so reading a personal Project does not require public webhook ingress. The authenticated runner-claim route remains a separate required gate for workflow execution. A hosting provider/control panel, hardcoded filesystem root or maintainer account is never an installation prerequisite.

Doctor reports the task/decision versus operational-state boundary, managed projection ownership, configured development/CI-review limits, projection backlog and stale/missing provider observations. When a session extension is enabled, it checks the actual runtime identity, authentication availability, interactive continuity and supported human/turn guards. Hook support is optional; disabled or unavailable hooks must have an advertised observation/reconciliation fallback. Installing tools or signing in does not by itself verify these runtime contracts.

OS service definitions belong to packaging examples (Linux first). Containers may be provided later; they must not disrupt the existing native agent daemon's identity or filesystem/session mapping.

## Recovery runbook

1. Pause new effects.
2. Identify outstanding operations and claims.
3. Query actual GitHub run/PR/deploy and target resource state.
4. Adopt verified completed/in-progress operations; retain unresolved items as unknown.
5. Inspect credential/host-key/config changes.
6. Resume only operations with a reconciled safe next action.

Do not delete the database as a reset method while external resources still exist.

Observation history may be read again with deduplication, but rebuilding an observation store is not recovery of operation intent, claims, workspace/session identity or ownership. The [W00.1 disposable observer probe](evidence/W00.1-actor-observation-2026-10-21.md) verified cursor catch-up and crash/overlap behavior only in its own harness. Doctor must distinguish those provider capabilities from an implemented and verified coordinator recovery path, report unsupported field/actor history, and reject invalid-cursor/partial-error results as evidence of successful catch-up.

## Metrics and logs

Measure queue age, active workspaces, action duration, unknown outcomes, failed reconciliation, projection conflicts, stale leases, CI repair attempts and cleanup blockers. Avoid issues/prompts as metric labels. Logs have stable codes, operation IDs and redacted safe messages.

Default redacted metadata retention is 90 days, configurable. Session transcript retention is controlled by its provider. Preserve records needed to reconcile unresolved work even if their normal retention date passes.
