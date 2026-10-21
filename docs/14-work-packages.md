# 14 — Work packages

Build small vertical slices. Dependencies are technical sequencing, not permission to skip acceptance. The private session-provider work can begin with W00 and join W04–W06 after its own compatibility gate.

The adopted [hybrid architecture](adr/0006-hybrid-coordination.md) retains one durable coordinator, GitHub task/human authority, Actions CI/delivery and optional agent observations. The first integrated continuity proof follows W00 discovery and W01 recovery, then joins W02/W03 with the independently installed session adapter. Prove duplicate-start recovery, connection loss, missing hook/projection recovery and human takeover before expanding all delivery/cleanup subsystems. This order preserves the full MVP scope and existing dependency graph.

## W00 — Resolve integration and toolchain gates

Tracker: [#3](https://github.com/alex-engvall/labstride/issues/3).

**Prerequisites:** None.

- Record supported runtime/dependency versions and licenses.
- Prove personal Project access, workflow OIDC identity and broker reachability with synthetic fixtures.
- Probe the actual interactive client's session identity/atomic guards and optional hook availability; define versioned hook-to-event normalization without making hooks mandatory.

**First verifiable outcome:** A recorded capability matrix and reproducible discovery commands; no real deploy.

**Requirements:** LS-GH-001, LS-EXT-001

**Discovery closeout:** W00.1 / [#11](https://github.com/alex-engvall/labstride/issues/11) is completed; [PR #39](https://github.com/alex-engvall/labstride/pull/39) merged its scoped provider evidence. See the [capability and handoff matrix](evidence/README.md). W00 and LS-GH-001 remain `in_progress` for cross-package acceptance; the unrun runtime cases do not keep discovery #11 open.

**Toolchain/contract closeout:** W00.3 / [#13](https://github.com/alex-engvall/labstride/issues/13) discovery is complete for the examined environment; #13 is closed as completed and [PR #41](https://github.com/alex-engvall/labstride/pull/41) merged the foundation. This documentation follow-up records the [capability matrix and handoff](evidence/W00.3-discovery-closeout-2026-10-21.md), distinguishing operator verification, backend reads, executable fixtures and the adopted initial hooks-disabled profile. LS-EXT-001 remains `in_progress`; AC22/AC31/AC35/AC36 stay `not_run`. Missing atomic guards block dependent effects and remain W01.4 work; they do not require reopening bounded discovery. Workflow OIDC/route evidence is recorded separately in W00.2; runtime acceptance stays with its owning packages.

**Workflow/route closeout:** W00.2 / [#12](https://github.com/alex-engvall/labstride/issues/12) has completed bounded discovery with the [isolated OIDC probe](27-oidc-discovery-probe.md) and [live evidence](evidence/W00.2-live-oidc-2026-10-21.md): genuine GitHub tokens, independent attempt identity, runner HTTPS, negative cases and renewal after expiry passed in two actual attempts. The temporary test service was stopped and its read token revoked. W04 still owns authenticated atomic claims/effect authorization; W01/W06 own durable recovery and installation/diagnostics. No application deploy or integrated acceptance was passed.

## W01 — Durable coordinator and operation model

Tracker: [#4](https://github.com/alex-engvall/labstride/issues/4).

**Prerequisites:** W00.

- Implement migrations, typed states, intent/outbox and atomic claims.
- Kill/restart a real process around each effect boundary.
- Apply the completed W00.1 discovery to atomic observation/checkpoint and intent/outbox persistence; preserve original operation identities and uncertain outcomes across actual coordinator crashes.
- Persist session observation and projection identity; prove missing/duplicate/late hook recovery and outbox retries without stale human-state overwrites.
- In W01.4 / #17, apply W00.3's pinned loading/profile contracts and session capability limits; preserve handle ownership, reject effects requiring unsupported atomic guards and complete AC31 plus production AC22 coverage with W07. Define/validate provider-specific question/answer payloads and verify actual client correlation/recovery.

**First verifiable outcome:** A queued synthetic operation resumes with its original ID after restart.

**Requirements:** LS-CORE-001, LS-CORE-002, LS-CORE-003, LS-CORE-004, LS-CORE-005, LS-CORE-006, LS-CORE-007, LS-EXT-003, LS-EXT-005

**W01.1 progress:** The first [durable lifecycle slice](28-durable-coordinator-store.md) has [process-crash and revision-conflict evidence](evidence/W01.1-lifecycles-2026-10-21.md). LS-CORE-001 is implemented locally; resource/evidence retention is the next #14 slice. AC01/AC20/AC36 remain integration gates and W01 stays in progress.

## W02 — Configuration and GitHub request/projection adapter

Tracker: [#5](https://github.com/alex-engvall/labstride/issues/5).

**Prerequisites:** W01.

- Compile configurable fields/rules and operator permissions.
- Implement current-state reconciliation and non-destructive projections.
- Use bounded personal-Project polling and one managed projection writer; keep human task/decision authority separate from operational records.
- Apply the completed W00.1 discovery to credential/container preflight, supported history reconciliation, actor/binding/generation authorization and safe cursor/error/budget/expiry handling; reject unsupported bindings and historical starts on initial import.
- Apply W00.3's session observation boundary to authorized, generation-bound projections; optional hooks cannot grant human intent or replace backend reconciliation.

**First verifiable outcome:** A test Project field transition creates exactly one queued run.

**Requirements:** LS-CFG-001, LS-CFG-002, LS-CFG-003, LS-CFG-004, LS-CFG-005, LS-GH-002, LS-GH-003, LS-GH-004, LS-GH-005

## W03 — SSH and independent workspace action

Tracker: [#6](https://github.com/alex-engvall/labstride/issues/6).

**Prerequisites:** W01.

- Implement host enrollment, trusted helper and resource registry.
- Create and reconcile independent source workspaces.
- Qualify W00.3's observed SSH prerequisite through real enrolled target/workspace effects and direct results without fabricated workflow identity.

**First verifiable outcome:** Two issues have separate branches/directories and recover after connection loss.

**Requirements:** LS-SSH-001, LS-SSH-002, LS-SSH-003, LS-SSH-004, LS-SSH-005, LS-SEC-001

## W04 — Workflow broker, CI and delivery action

Tracker: [#7](https://github.com/alex-engvall/labstride/issues/7).

**Prerequisites:** W02, W03.

- Implement authenticated claims, receipt validation and dispatch reconciliation.
- Recheck exact-revision CI/merge permissions; invoke own test deploy workflow.

**First verifiable outcome:** A test deployment is tied to the correct source and workflow revisions and verified target.

**Requirements:** LS-GH-006, LS-GH-007, LS-DEP-001, LS-DEP-002, LS-DEP-003, LS-DEP-004, LS-DEP-005, LS-DEP-006, LS-SEC-002

## W05 — Directory cleanup action

Tracker: [#8](https://github.com/alex-engvall/labstride/issues/8).

**Prerequisites:** W03, W04.

- Implement policy eligibility, keep/quiescence and dirty/unpushed checks.
- Implement safe target deletion with durable tombstones.

**First verifiable outcome:** One eligible directory is removed; blocked and unrelated paths remain intact.

**Requirements:** LS-CLN-001, LS-CLN-002, LS-CLN-003, LS-CLN-004, LS-CLN-005

## W06 — CLI, installation and operations

Tracker: [#9](https://github.com/alex-engvall/labstride/issues/9).

**Prerequisites:** W02, W03, W04.

- Implement operator diagnostics and pause/reconcile controls.
- Exercise backup, upgrade and restore with unresolved external effects.
- Complete W00.1's runtime handoff through Doctor diagnostics for missing capabilities, invalid cursors, expired credentials and unknown outcomes; verify AC29 using the owning GitHub/broker/host slices.
- Package the CLI and single service together; diagnose optional hook/session compatibility without a hosting/control-panel dependency.
- Apply W00.3's capability matrix: diagnose hooks-disabled, missing/untrusted hooks and unsupported atomic guards. Support W01.4 / #17's session-provider enablement/continuity gates operationally; manual client verification and fixture success do not pass AC31/AC35/AC36.

**First verifiable outcome:** A fresh operator can diagnose and recover a run without editing database rows.

**Requirements:** LS-OPS-001, LS-OPS-002, LS-OPS-003, LS-OPS-004, LS-OPS-005

## W07 — Public examples and prerelease

Tracker: [#10](https://github.com/alex-engvall/labstride/issues/10).

**Prerequisites:** W05, W06.

- Validate a clean public install without private extensions.
- Finish DCO, reporting route, contract SDK, examples and release evidence.
- Complete W00.3's runtime/package dependency integrity, notices and clean-install qualification with W01, preserving the agent-independent public path.

**First verifiable outcome:** A versioned prerelease with all P0 acceptance evidence and explicit platform limits.

**Requirements:** LS-EXT-002, LS-EXT-004, LS-SEC-003, LS-OSS-001, LS-OSS-002, LS-OSS-003, LS-OSS-004

## PR handoff

State the problem and observable result, relevant LS/AC IDs, dependencies, contract changes, verification evidence, untested limits and recovery plan. A work package may need several small PRs. Do not use a requirement count as a reason for one oversized PR.
