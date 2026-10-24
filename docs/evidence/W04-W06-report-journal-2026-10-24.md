# Native result handoff correction — 2026-10-24

Scope: bounded W01.4/W04/W06, LS-EXT-005, LS-GH-006 and LS-OPS-001; supporting evidence for AC35/AC36, not completed live acceptance.

## Observed finding

The operator approved the version-command plan, implementation produced a signed-off commit, and the native report tool acknowledged receipt. A later GitHub read found neither the corresponding branch nor a PR. The operator's run snapshot showed a registered session, a running self-build operation and `lastError: outcome_unknown`, but no workflow diagnostic. That last-error field alone did not establish a failed publication: the worker marks a running operation unknown before each read reconciliation and retains that delivery field after an accepted observation.

Read-only queries to the actual registered native session established that the completed implementation turn's explicitly full legacy history contained user/agent/file-change/reasoning items, but no dynamic tool call for the acknowledged result. The existing bridge acknowledged native report requests after validation and later searched history for that tool item without persisting it. Controlled tests had supplied the missing item and therefore did not establish this real handoff. The installed backend's locally generated protocol confirms native report requests have `threadId`, `turnId`, `callId`, `tool` and `arguments`.

These observations identify a report transport defect. They do not prove every cause of the original run's state or resolve an uncertain external mutation. No original receipt is rewritten, no earlier turn is replayed, and no installation state is changed by this source correction.

## Correction

The bridge now commits schema-validated report data to a private SQLite journal before sending a successful dynamic-tool response. The journal uses synchronous commits and schema version 1, with receipt-binding digest, session/turn/native call identity and payload digest. Duplicate identical calls are idempotent. Invalid data or failed persistence receives no success acknowledgement. Multiple differing successfully recorded reports for one turn conflict and block publication.

Only the latest completed turn can release its journaled report. The existing original-workspace validation and same-turn explicitly full snapshot checks remain required, as do independent Git/branch/ancestry/DCO/CI-definition checks and latest-turn rechecks before publication. A later human turn does not silently adopt an old report. Existing successful dynamic-tool items remain readable as compatible evidence, and conflicts with journaled data block publication. Reports remain task data; the journal is no credential or permission authority.

The optional configurable bridge `reportDirectory` lets operators retain the journal outside runtime directories. Fresh bootstrap source provisions a private bridge-owned state directory. Existing configurations fall back to their existing `stateDirectory`; service-manager removal of a runtime directory or reboot can lose that fallback journal. Existing installations require a reviewed update and persistent path; neither is applied here. The coordinator database schema is unchanged.

## Verification

Focused tests execute the actual bridge and journal with native replies that omit the report item. An independent database reader sees the committed report before acknowledgement, incomplete turns cannot publish, and reopening the bridge recovers the same report. Duplicate/conflicting calls, invalid reports, unavailable journals, changed full snapshots and later-turn invalidation are covered. A real writer process is killed with SIGKILL after recording; a new reader recovers the same payload and rejects foreign bindings/turns. Unmanaged and symlinked journal paths are preserved and rejected.

An integration test connects the actual bridge/journal to the self-build action, exports/verifies a real Git bundle, pushes to a disposable local bare repository and observes exactly one review PR through controlled GitHub replies. It sends one initial task and retains the original session. This is local recovery/publication evidence, not a live GitHub PR or an installed-service test.

Checks executed on Linux with Node 24.22.0:

- Focused journal/bridge/workflow suite: all 21 tests passed, no skips; repeated after the final path-isolation guard.
- Full `npm test`: 553 tests, 545 passed, zero failures and eight explicit skips requiring an isolated root-operated OpenSSH server.
- `npm run check:types`: all 71 generated contracts matched and TypeScript passed.
- Pinned-environment documentation/schema validation and generated-checklist verification passed; all six Python tests passed.
- `python3 -m py_compile scripts/install_local.py` passed. Administrative bootstrap behavior was not executed; no installed paths were changed.

The native protocol inspection was read-only on the existing enrolled session. It exercised no new turn, resumed task, replacement session, tool report or publication. The controlled publication test remains distinct from live GitHub acceptance.

## Open recovery gate

The installed bridge still needs an operator-approved update. The earlier report was not journaled and cannot be manufactured retroactively. After the correction is installed, request a fresh report for the existing committed result in the same original session. Preserve any unknown push/PR/native operation rather than repeating it. The unknown resources from #68 also remain untouched. No push, merge, deployment, credential/policy change or service restart is performed by this correction. W04/W06 and AC35/AC36 remain open until independently observed installed publication/recovery is qualified.
