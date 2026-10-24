# Bounded native report observation — 2026-10-24

Scope: bounded W01.4/W04/W06, LS-EXT-005, LS-GH-006 and LS-OPS-001; supporting AC29/AC35/AC36 evidence. Broader acceptance remains open.

## Live finding

The coordinator published the actual canary as [PR #72](https://github.com/engshort/labstride/pull/72) at source head `5089cf396088554555cdbee3a3f636f073754d6f`. Both pull-request workflows completed successfully. Read-only execution of the installed coordinator's CI decision against actual current-head workflow/check/status responses also returned `passed`. The PR nevertheless remained draft, with no readiness intent and a blocked observation after five read failures. The acknowledged push and PR creation records, and the older uncertain push, remained intact.

A read-only native protocol measurement found the latest completed question/answer turn serialized to 264,689 bytes. The production WebSocket transport deliberately bounds each message at 262,144 bytes. Fetching an explicitly full transcript therefore disconnected the RPC and produced `outcome_unknown` before the newer journaled report could be consumed. An earlier smaller implementation turn had been observable, explaining successful PR creation followed by failed readiness observation. This is a transcript-size failure, not failed CI or evidence that readiness had already been attempted.

## Correction

The native tool handler's committed journal entry is the report receipt. Rehydrating tool output adds no receipt evidence. The bridge now reads the exact receipt/session/turn-bound journal and confirms the same latest completed turn with a second bounded summary request. Changed, active, interrupted, failed, missing or unavailable confirmation cannot release a report. Conflicting journaled payloads still block publication, and foreign receipt/session bindings cannot establish journaled delivery.

After journaled delivery is established for that binding/session, later ordinary conversation without a report returns waiting without loading its transcript or adopting an earlier report. A session with no bound journaled reports retains the existing history-only compatibility path, requiring an explicitly full same-turn response within the unchanged RPC bound. Oversized legacy evidence remains blocked; it does not authorize invented receipts or mutation retries.

No transport limit, credential, policy, native session, workspace, old acknowledgement or CI workflow is changed by this source correction. Latest-turn checks before push, PR creation and readiness remain required. The known checked-delivery race and lack of atomic backend ownership remain documented in ADR-007.

## Validation and remaining gate

A real Unix-domain WebSocket regression uses the production RPC client and persisted report journal. A 300,000-character transcript is observable through metadata without a full request; a later unreported turn returns no report. An explicit oversized wire reply is still rejected by the unchanged transport. Negative cases cover changed or incomplete confirmation, missing/unavailable reads, conflicting reports and foreign bindings. The existing real-bundle/local-push workflow suite remains separate from live provider qualification.

Executed on Linux with Node 24.22.0:

- Focused bridge/journal/publication suite: 29 passed, no skips.
- Full Node suite: 568 tests, 560 passed, zero failures and eight explicit isolated-root/OpenSSH skips.
- Type checks and all 71 generated contracts passed.
- Documentation/schema validation and generated-checklist verification passed; all six Python checks passed.

Installation of this bridge correction, resumption of the blocked read observation and automatic readiness on the resulting current PR head remain subsequent gates. The earlier unknown run and push must remain preserved. No merge or application deployment is part of this correction.
