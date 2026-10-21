# 12 — Test and quality plan

Tests verify outcomes and boundaries. Every implemented requirement must link to real evidence for its acceptance criteria. The backlog begins planned; no live tests were run in preparing this archive.

## Layers

1. Domain tests: typed rules, permission decisions, state transitions, configuration precedence and lock conflicts.
2. SQLite integration tests: unique claims under concurrency, transaction rollback, outbox recovery, real process restart and schema migration.
3. Extension conformance: use the shared request/result schemas, unknown outcomes and repeated calls.
4. SSH integration: disposable Linux SSH target with real host-key validation, filesystem ownership, interruption and cleanup races.
5. GitHub contract tests: synthetic fixtures plus an opt-in owned test repo/project for real permissions, event availability, dispatch and current-revision checks.
6. End-to-end pilot: real isolated workspaces, interactive session continuity, test-environment deploy and guarded cleanup.

Use synthetic data. Real customer data, production credentials or financial writes are not test fixtures. Run only tests relevant to the changed boundary; a broad suite is justified before release and for cross-cutting changes.

## First continuity and recovery proof

Follow the sequence in [ADR-006](adr/0006-hybrid-coordination.md). W00 discovers real interactive session/atomic-guard capabilities; W01 proves durable intent and session protocol fixtures. Once their prerequisites pass, integrate one owned GitHub test issue, an isolated SSH checkout and the installed session provider. The existing interactive client must resume the same session and a human turn must prevent stale automated continuation.

Inject duplicate starts, SSH response loss, coordinator death, missing/reordered/duplicate hook reports and GitHub projection failure. Reconciliation must retain the original resource identities, preserve human edits and classify uncertainty explicitly. Disable hooks and prove that provider observation still recovers state. The public fixture runs without private packages or a personal Codex login; actual owner-client compatibility is a separate live test. AC35 and AC36 record the additional acceptance specifications; neither is considered executed by documentation validation.

## Required scenarios

The machine-readable [acceptance cases](acceptance-cases.json) specify preconditions, actions and expected outcomes. They include duplicate events, stale projections, unauthorized starts, host-key mismatch, simultaneous workspace creation, lost workflow acknowledgement, two claims, unknown deploy, stale CI, changed plan, manual takeover, keep and unsaved-work cleanup blockers.

For every side-effecting action, inject crashes before intent persistence, after dispatch, before the effect, after the effect and before result persistence. Prove either adoption of the original operation or explicit unknown outcome without a second effect.

## Evidence record

Record requirement IDs, case IDs, source commit, configuration/extension digests, test environment, command/run URL, actual result and limitations. A test with mocks does not establish live provider permissions. A successful connection does not establish safe cancellation or cleanup.

## Documentation validation

Run python3 scripts/validate_docs.py. It validates local Markdown file links, JSON schema structure/examples, requirement IDs, work-package references and generated checklist freshness. It does not invoke application commands or deploy anything. Install its pinned documentation dependency using python3 -m pip install -r requirements-docs.txt. A missing validator fails the check rather than silently skipping schemas.

## Release quality gates

All P0 MVP criteria have evidence; no unresolved unsafe effect-replay or resource-ownership defect; installation/upgrade/backup recovery are exercised; public examples can be followed without private dependencies; package/license provenance is recorded; known limitations are explicit.
