# 14 — Work packages

Build small vertical slices. Dependencies are technical sequencing, not permission to skip acceptance. The private session-provider work can begin with W00 and join W04–W06 after its own compatibility gate.

## W00 — Resolve integration and toolchain gates

**Prerequisites:** None.

- Record supported runtime/dependency versions and licenses.
- Prove personal Project access, workflow OIDC identity and broker reachability with synthetic fixtures.

**First verifiable outcome:** A recorded capability matrix and reproducible discovery commands; no real deploy.

**Requirements:** LS-GH-001, LS-EXT-001

## W01 — Durable coordinator and operation model

**Prerequisites:** W00.

- Implement migrations, typed states, intent/outbox and atomic claims.
- Kill/restart a real process around each effect boundary.

**First verifiable outcome:** A queued synthetic operation resumes with its original ID after restart.

**Requirements:** LS-CORE-001, LS-CORE-002, LS-CORE-003, LS-CORE-004, LS-CORE-005, LS-CORE-006, LS-CORE-007, LS-EXT-003, LS-EXT-005

## W02 — Configuration and GitHub request/projection adapter

**Prerequisites:** W01.

- Compile configurable fields/rules and operator permissions.
- Implement current-state reconciliation and non-destructive projections.

**First verifiable outcome:** A test Project field transition creates exactly one queued run.

**Requirements:** LS-CFG-001, LS-CFG-002, LS-CFG-003, LS-CFG-004, LS-CFG-005, LS-GH-002, LS-GH-003, LS-GH-004, LS-GH-005

## W03 — SSH and independent workspace action

**Prerequisites:** W01.

- Implement host enrollment, trusted helper and resource registry.
- Create and reconcile independent source workspaces.

**First verifiable outcome:** Two issues have separate branches/directories and recover after connection loss.

**Requirements:** LS-SSH-001, LS-SSH-002, LS-SSH-003, LS-SSH-004, LS-SSH-005, LS-SEC-001

## W04 — Workflow broker, CI and delivery action

**Prerequisites:** W02, W03.

- Implement authenticated claims, receipt validation and dispatch reconciliation.
- Recheck exact-revision CI/merge permissions; invoke own test deploy workflow.

**First verifiable outcome:** A test deployment is tied to the correct source and workflow revisions and verified target.

**Requirements:** LS-GH-006, LS-GH-007, LS-DEP-001, LS-DEP-002, LS-DEP-003, LS-DEP-004, LS-DEP-005, LS-DEP-006, LS-SEC-002

## W05 — Directory cleanup action

**Prerequisites:** W03, W04.

- Implement policy eligibility, keep/quiescence and dirty/unpushed checks.
- Implement safe target deletion with durable tombstones.

**First verifiable outcome:** One eligible directory is removed; blocked and unrelated paths remain intact.

**Requirements:** LS-CLN-001, LS-CLN-002, LS-CLN-003, LS-CLN-004, LS-CLN-005

## W06 — CLI, installation and operations

**Prerequisites:** W02, W03, W04.

- Implement operator diagnostics and pause/reconcile controls.
- Exercise backup, upgrade and restore with unresolved external effects.

**First verifiable outcome:** A fresh operator can diagnose and recover a run without editing database rows.

**Requirements:** LS-OPS-001, LS-OPS-002, LS-OPS-003, LS-OPS-004, LS-OPS-005

## W07 — Public examples and prerelease

**Prerequisites:** W05, W06.

- Validate a clean public install without private extensions.
- Finish DCO, reporting route, contract SDK, examples and release evidence.

**First verifiable outcome:** A versioned prerelease with all P0 acceptance evidence and explicit platform limits.

**Requirements:** LS-EXT-002, LS-EXT-004, LS-SEC-003, LS-OSS-001, LS-OSS-002, LS-OSS-003, LS-OSS-004

## PR handoff

State the problem and observable result, relevant LS/AC IDs, dependencies, contract changes, verification evidence, untested limits and recovery plan. A work package may need several small PRs. Do not use a requirement count as a reason for one oversized PR.
