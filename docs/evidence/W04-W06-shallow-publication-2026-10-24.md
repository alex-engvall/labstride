# Shallow publication and acknowledgement recovery — 2026-10-24

Scope: bounded W01.2/W04/W06; LS-CORE-002, LS-CORE-004, LS-GH-006 and LS-OPS-001. Full workflow/deployment/recovery acceptance remains separate.

## Finding and preserved outcome

After the operator approved and applied the bridge-only report-journal update, the current native report was actually recorded in the bridge journal and consumed by the coordinator. The original run then reached a push intent with no acknowledgement and exhausted five read retries. A read-only provider lookup found no corresponding branch or PR. These observations did not grant permission to repeat that intent.

Credential-free reproduction with the actual canary Git bundle identified a deterministic local import failure: its depth-one checkout contained the enrolled source revision but not that commit's earlier parent history. A fresh bare import tried to traverse those unavailable parents. The previous publication code had already recorded a remote push intent before doing this local preparation. Earlier controlled tests pinned the upstream's first commit and therefore did not cover a baseline with missing parent history.

The original uncertain push record remains preserved. A newer independently committed and reported result has a distinct head-specific push intent. This correction does not rewrite an old acknowledgement, recreate the workspace/session or authorize cleanup of the earlier unknown canary.

## Correction and contract limits

The credential-free local preparation helper validates the declared head/base/branch against registered identities, verifies/imports the bundle with exactly the enrolled source SHA as its shallow boundary, and checks ancestry, nonempty changes, DCO and unchanged CI definitions. It does not request credentials or register a remote intent. Stable preparation error codes identify the failed local stage. The final native-turn check and credential resolution also precede the push intent; that intent covers the actual remote write and readback only.

Git documents the shallow boundary as the list of commit objects whose earlier history is outside the local graph: [Git shallow repository format](https://git-scm.com/docs/shallow). Only the coordinator's already-enrolled source identity supplies this boundary; arbitrary boundaries from task data are not accepted.

Read-only recovery can adopt a push only from an exact repository/branch/head ref. It can adopt a lost PR creation only from one open PR matching the original run marker, source repository, branch, configured base and current reported head. A matching current non-draft PR can resolve a lost review-readiness response. Adoptions append evidence to the coordinator log and never dispatch the same mutation again. Missing/conflicting observations preserve uncertainty and block forward publication for that intent. An unrecorded/manual PR is not silently adopted.

A successful bound running acknowledgement resets the consecutive read-failure budget and stale delivery error. Unknown observations do not. Recovered workflow diagnostics are cleared only on a valid ongoing/review observation; explicit blocked-agent or failed-CI diagnostics remain visible. These status changes do not delete uncertain sub-effects, cancellation records or their recovery evidence.

## Executable checks

The actual previously failing canary bundle now imports successfully with the corrected helper, preserving its exact head and registered source boundary. Controlled publication tests now use a real depth-one checkout whose enrolled baseline has earlier history, and a full upstream bare destination. They exercise actual bundle/import/ancestry/DCO/diff checks and local Git writes. Controlled GitHub peers separately verify one mutation under lost push/PR/readiness replies, conflicting refs/markers, failed preparation before credential access, human activity during preparation and preservation of an older unknown push while a newer report advances.

Negative bundle checks cover unsigned commits, CI workflow edits, unrelated graphs, empty changes and substituted head/base/branch identities. A real-store worker test verifies that a failed read followed by a valid running observation resets the failure streak without calling the action's start method again.

Executed on Linux with Node 24.22.0:

- Focused publication/workflow/installed-operation suite: 32 passed, no skips.
- Full Node suite: 567 tests, 559 passed, zero failures and eight explicit isolated-root-OpenSSH skips.
- Type checking and all 71 generated contracts passed. Documentation/schema/checklist validation and all six Python tests passed.
- The exact earlier canary bundle was re-created without changing its head or replaying its remote intent; the corrected helper verified its head, two new signed-off commits and original registered source boundary.

Installation of this coordinator correction and live PR/CI qualification remain subsequent gates. Controlled peers are not live GitHub qualification. No automatic merge, deployment, credential/policy change or workspace deletion is part of this correction.
