# 16 — Operations and CLI

## Intended commands — not implemented

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

OS service definitions belong to packaging examples (Linux first). Containers may be provided later; they must not disrupt the existing native agent daemon's identity or filesystem/session mapping.

## Recovery runbook

1. Pause new effects.
2. Identify outstanding operations and claims.
3. Query actual GitHub run/PR/deploy and target resource state.
4. Adopt verified completed/in-progress operations; retain unresolved items as unknown.
5. Inspect credential/host-key/config changes.
6. Resume only operations with a reconciled safe next action.

Do not delete the database as a reset method while external resources still exist.

## Metrics and logs

Measure queue age, active workspaces, action duration, unknown outcomes, failed reconciliation, projection conflicts, stale leases, CI repair attempts and cleanup blockers. Avoid issues/prompts as metric labels. Logs have stable codes, operation IDs and redacted safe messages.

Default redacted metadata retention is 90 days, configurable. Session transcript retention is controlled by its provider. Preserve records needed to reconcile unresolved work even if their normal retention date passes.
