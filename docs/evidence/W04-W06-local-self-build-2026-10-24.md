# Bounded local self-build implementation — 2026-10-24

Scope: W01.4/W02 extensions, bounded W04 issue-to-review and W06 CLI/service/bootstrap. LS-GH-006, LS-OPS-001/002/004/005 and LS-SEC-002 have partial implementation; complete W04/W06/W07 remain open. This report does not pass the full deployment, restore, upgrade, reporting or prerelease criteria.

## Accepted decisions and adopted design

The operator approved native Plan mode and continued approval in the same Codex session; AI fields supply startup values, defaulting to Plan/GPT-6.1 Sol/Medium only when absent. Human app settings then prevail. Merge and installation upgrade require the operator. Deploy is disabled. The operator explicitly accepted journaled checked delivery with a latest-turn check and its remaining concurrency risk; [ADR-007](../adr/0007-checked-codex-delivery.md) specifies that profile separately from the unchanged conservative provider.

## Implementation evidence

- `packages/storage-sqlite/workflows.ts` and migration 13 retain ordered step identity, original receipt/session/report/PR bindings and committed mutation intents. A verified completed checkout is required before the next operation is scheduled.
- `packages/operations` and `apps/cli/main.ts` implement protected configuration, dedicated App credential renewal, catalog/SSH/root preflight, service exclusion, bounded polling, controls, non-destructive issue summaries and SQLite backup. Known accepted waits do not consume a transient failure budget.
- The public checked Codex bridge validates the owned checkout against its protected receipt, starts a persistent native session on the existing daemon, submits only the initial task, resumes without settings overrides and reads typed reports from the latest completed turn. It never answers app questions/approvals.
- Publication imports a credential-free Git bundle into a separate bare repository, checks exact SHA/ancestry/diff/DCO/workflow boundaries, rechecks current turn/pause and publishes using the protected App credential. CI uses current-head workflow/check/status evidence. Follow-up reports reuse the original PR and preserve human title/body edits.
- `scripts/package_local.py` records exact source/Node/dependency/extension bytes. `scripts/install_local.py` prepares separate OS identities, forced-command SSH enrollment, protected roots/credentials and stopped systemd units. Packaging/bootstrap do not activate automation or merge code.

## Executed local and read-only checks

Node 24.22.0, Linux, SQLite and Codex daemon 0.163.0 were examined. The existing authenticated daemon's actual model catalog contains GPT-6.1 Sol with Medium. No competing backend was started.

The dedicated organization App installation was independently checked through its own installation token: exactly the intended repository, organization Issue Fields(read), the configured repository grants, six real field definitions and their current option IDs, qualified actor-bearing request history and operation-specific field write capability. GitHub reports a null human repository role for this installation token; the adapter verifies `viewerCanSetFields` on the independently enrolled issue and again before writes. Broad CLI access is not counted as that credential verification. These read-only checks do not prove mutation delivery.

The final complete Node regression run passed 524 of 532 tests, with zero failures and eight explicit root/sshd skips under the coding identity. All 17 focused installed-workflow/recovery tests passed; type checking (70 generated contracts), documentation/schema validation (55 schema/example pairs) and all six Python tests passed. Retain the distinction between controlled peers and live providers.

`tests/installed-operations.test.mjs` exercises the disabled-broker boundary, transactional step deduplication/reopen, pause gates, actual SIGKILL after managed intent, actual service-lock holder death, accepted waiting, defaults/unsupported choices, current-head CI decisions, scoped credential refusal, backup and shutdown.

`tests/managed-codex-bridge.test.mjs` uses real owned Git checkouts and controlled native RPC replies to test original receipt binding, one native Plan turn, refusal of later automatic instructions, latest-turn report correlation, backend mismatch and actual bundle verification/dirty-work refusal. This is not a live native approval/reconnect proof.

`tests/self-build-workflow.test.mjs` composes an actual isolated checkout, transactional advancement, controlled Codex/GitHub peers, real commits/bundle verification/local pushes, current-revision readiness, a follow-up commit in the same PR and a lost PR-creation reply. It asserts a single session/initial turn/PR, preserved human title and unknown outcome without duplicate PR creation.

The native adapter regression additionally covers installation-token null roles without treating a declared grant as sufficient evidence. Existing GitHub tests cover duplicate/inert/unauthorized transitions and manual projection conflicts. Those are regression coverage, not a substitute for the full newly installed live scenario.

## Installed startup finding and correction

The first disabled bootstrap passed CLI doctor with zero runs. A real systemd start then correctly refused a mismatched local mount ID: systemd mount isolation presents another mount namespace. The corrective profile preserves `PrivateTmp`, `ProtectSystem`, `ProtectHome` and the full authoritative target mount check. Connector 1.3.0 adds opt-in `workspace.root-map.v1` proof to the versioned workspace probe. The authenticated helper validates its complete root identity and returns the root/path/identity binding. The coordinator compares that full target proof with the protected mapping, then verifies the same physical object in its namespace. Legacy probes omit the optional fields and remain compatible. All 77 focused helper/workspace/runtime regressions passed. A focused regression checks both views and rejects wrong mount IDs, missing proof and a substituted inode.

The unused disabled bootstrap may be preserved in full before correction only after confirming zero runs, operations, reservations, created workspaces and an empty source root. No pending effect, existing pilot workspace or database downgrade is eligible for this installation correction.

The corrected helper proof passed actual installed doctor while keeping all systemd protections. Actual coding-UID probes denied seven protected reads and ten writes, and denied writes to the source root. A longer service start exposed a separate initial activation ordering error: policy publication referenced an installation row before it existed. The corrected store commits configuration and policy together; a real SQLite regression verifies first activation, rejection rollback and idempotence. The corrected installed service subsequently ran without restart or error, retained 37 inert historical issue baselines and refused a second service through the process lock. An actual coordinator SIGKILL triggered systemd restart and retained those baselines with zero runs; this was an idle-process recovery check, not an active native-effect crash proof. Immutable release staging preserved helper enrollment, extension pins, protected files and consistent backups.

Actual PR CI exposed an optional documentation-deploy job that correctly skips on PRs. Readiness now binds required workflow runs to their current-head check-suite IDs and checks every job in those required suites. Other suites do not silently become required deployment gates. Missing suite evidence, wrong-head checks and skipped required checks remain blocked.

## Installed bounded qualification

On source revision `62e2f79eeae5d821967069650f4650af4137eef6`, actual installed doctor, dedicated credentials, negative access checks, process exclusion/restart and consistent pre-activation backup passed. The coordinator then processed two new authorized No agent issues after their inert initial observations. Each received its own actual checkout and branch, registered Path, absent session, Ready to start progress and default model/reasoning. A repeated Approved value created no additional run. Actual coding-UID probes wrote inside both source checkouts, matched registered branch/HEAD, and were denied writes to the ownership markers and protected wrapper directories. No native session was created.

Both bounded runs were canceled through the installed CLI after their operations succeeded; their keep-marked workspaces and database remain intact. The coordinator was stopped and its configuration disabled after qualification. These checks demonstrate the installed No agent chain; they do not prove native planning or publication. The implementation PR's two actual current-head CI workflows passed, and the dedicated installation credential independently evaluated their required suites as passed.

A final recovery regression freezes a versioned startup selection before native creation. Controlled reply loss followed by a manual No agent edit retains the original Plan input, one unknown native start and no registered replacement. A separate unsupported-catalog case produces no native intent and can be canceled through the real control worker while retaining its workspace.

## Open live gates

The real `labstride version --json` canary requires the implementation/CI PR to be merged by the operator first, then a new authorized issue, actual planning, operator approval in the same session, implementation, reconnection, correct native fields, real PR and green current-head CI. Two concurrent installed No agent issues passed the bounded isolation checks above. Agent-enabled isolation, real process loss around native session start/PR publication and simultaneous manual turn start remain live qualification work. No approval, CI result or full acceptance is inferred from this report.

AC02/03/13/14/21/22/23/24/27/28/29/35 retain their canonical full-scenario status. Existing passed AC31/36 evidence applies to its earlier tested conservative profile; this new checked profile does not inherit atomic protection from it. Keep unknown effects, historical pilot resources and prior release pins. Database downgrade, deletion of workspaces and automatic self-upgrade are excluded.
