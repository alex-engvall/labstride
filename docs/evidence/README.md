# W00.1 — GitHub capability evidence and implementation handoff

Recorded 2026-10-21 for [issue #11](https://github.com/alex-engvall/labstride/issues/11), **LS-GH-001** and **W00**. This index separates live provider observations, adopted implementation constraints and remaining acceptance work. The application runtime is not implemented; LS-GH-001 and W00 remain `in_progress`.

## Verified provider capabilities and limits

The operator selected public `alex-engvall/fortnox-mcp` as the sole dedicated App test repository and personal Project #8 as the Project target. Those are evidence fixtures, not product defaults. In the dedicated-credential probes, repository effects used downscoped App installation tokens and Project effects used a separate user PAT reporting only `project`. The earlier broad-credential discovery is recorded separately below.

| Surface | Verified in the bounded live probes | Limit / evidence |
| --- | --- | --- |
| Dedicated App | One selected repository; declared grants matched; issue create/read/close/read succeeded | [App report](W00.1-dedicated-app-2026-10-21.md). Public reads alone do not prove private-container access. |
| Personal Project writes | PAT read fields/pages, created a draft and public-issue membership, set/read/cleared Priority and removed only new memberships | [Project report](W00.1-project-pat-2026-10-21.md). App draft creation was rejected. Classic `project` scope is broader than a single Project. |
| Files, PRs and downstream CI | App created/updated a fixture file, created/updated/closed PR #81; all three PR CI workflows passed with actor/head/base evidence | [File/PR/CI report](W00.1-app-file-pr-ci-2026-10-21.md). No merge, deploy, workflow edit or dispatch; Actions remained read-only. |
| Project actors/history | PAT recovered nine issue-backed built-in Status/membership events with event and actor IDs | [Actor/observation report](W00.1-actor-observation-2026-10-21.md). App returned zero events without errors; arbitrary-field/draft history is not established. User type and `wasAutomated=false` do not prove human approval. |
| Observation/reconciliation harness | Live missed-Status catch-up, crash before SQLite commit, restart/overlap deduplication, invalid-cursor rejection and empty observation-store rebuild | [Actor/observation report](W00.1-actor-observation-2026-10-21.md). Disposable harness only; not coordinator, outbox or workspace/session recovery. Lost write acknowledgement remained uncertain despite a matching current value. |

A read-only review checked the archived observation source hashes, both nine-event SQLite stores and the live PR/CI metadata. The [CI report](W00.1-app-file-pr-ci-2026-10-21.md) distinguishes the original retained PR/base associations from the now-empty run API PR lists. The [observation report](W00.1-actor-observation-2026-10-21.md) distinguishes a process crash before local acknowledgement persistence from a dropped network response. Historical receipts and current provider observations are separate evidence; this review reran no mutation or acceptance scenario.

The [initial broad-credential report](W00.1-github-access-2026-10-21.md) records the starting access and probe shapes. It is not evidence for the later dedicated credentials. Each report records API/client versions, readbacks, reproduction steps and cleanup. Private credentials, installation configuration and probe archives stay outside this public repository; the reproduction contracts are not installed Labstride commands.

Cleanup preserved the original 37 Project memberships and the repository's original main revision. Synthetic issue #80 and closed, unmerged PR #81 remain audit artifacts. Project history also remains after membership cleanup. Restored current state does not erase audit history or establish general rollback guarantees.

## Remaining implementation by work package

These are refinements of the existing package scopes and adopted hybrid design, not changed user decisions or completed features. Follow the original prerequisites in [work packages](../14-work-packages.md).

| Owner | Remaining work informed by this evidence | Required observable result |
| --- | --- | --- |
| [W01 / #4](https://github.com/alex-engvall/labstride/issues/4) | Implement durable operation/request identity, atomic observation/checkpoint state and intent/outbox persistence. Exercise actual coordinator crashes around effect boundaries; retain claims and workspace/session ownership while reconciling uncertain effects. | A restarted coordinator resumes the original operation without duplicating effects or replacing its recorded identities. Rebuilding provider observations must not replace durable operation state. |
| [W02 / #5](https://github.com/alex-engvall/labstride/issues/5) | Implement credential/container-specific capability checks, bounded polling, supported Status/membership history plus current-state reconciliation, actor authorization and binding/generation validation. Deduplicate stable event IDs; handle cursor overlap, partial GraphQL errors, API budgets and expiry. Reject unsupported field/history bindings; do not launch old requests on initial import. | An authorized supported transition creates exactly one queued run. Missing history/actor capabilities prevent enablement with an actionable reason; reordered or repeated observations do not authorize stale requests. |
| [W06 / #9](https://github.com/alex-engvall/labstride/issues/9) | Implement Doctor, pause/reconcile controls and recovery guidance for missing grants/history/actors, expired credentials, invalid cursors, partial results and unknown outcomes. Exercise backup/restore with unresolved effects and durable operation/session records. | A fresh operator can diagnose missing capabilities and recover the same run without editing database rows or replaying a possibly completed effect; complete AC29 with the required broker/host settings too. |

W01 owns durable state and effect recovery; W02 supplies the provider observation/reconciliation behavior; W06 exposes and verifies operator diagnostics and recovery. Continuous polling, retention bounds, larger/concurrent histories, backoff and token-expiry recovery have no live implementation evidence yet. Same-second history order and `totalCount` must not be treated as authoritative operation ordering or membership completeness.

For CI evidence, W01 must retain validated identities/receipts, W02 must reconcile provider facts without inventing missing associations, and W06 must expose unresolved evidence to the operator. W04 still owns current-revision merge/delivery gates. Likewise, recovered Status events do not pass W02's start-rule authorization, ordering or generation gate. Workspace/session effects still require W03 and the enrolled session adapter; the W01 handoff does not implement those integrations.

Other W00/W04 gates also remain: runtime/dependency inventory, actual client/session compatibility, workflow OIDC/broker reachability and later authorized dispatch/delivery behavior. The three green fortnox-mcp workflows verify the App PR trigger path only. They do not verify these Labstride features.

**Acceptance status:** AC02, AC05, AC29, AC35 and AC36 remain `not_run`. No real Labstride run, enrolled workspace/session, Doctor or integrated recovery scenario was exercised. See [open gates](../21-readiness-and-open-gates.md) and the canonical [backlog](../backlog.json); this evidence does not close issue #11.
