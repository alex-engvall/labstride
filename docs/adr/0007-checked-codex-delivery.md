# ADR-007 — Explicit checked delivery to an existing Codex daemon

Status: adopted for the opt-in `self-build.checked-delivery.v1` profile. This does not replace the conservative `session-codex` provider or claim complete W01.4/W04/W06 acceptance.

## Context and accepted direction

The local operator accepted native Codex Plan mode, approval through continued conversation in the same app session, startup-only AI field settings, and journaled delivery with a latest-turn check. The installed workflow ends at a reviewable PR; merge and service upgrade remain operator actions. A mode switch is not plan approval. No automatic answer to a question or approval request is authorized.

The examined Codex 0.163.0 App Server supports creating a persistent thread, native collaboration mode, dynamic tools, turn observations and metadata-only resumption through its existing daemon. It does not provide an atomic compare-and-start guard correlated with concurrent human activity, or a durable caller-supplied receipt for thread/turn creation. A read followed by a mutation cannot establish those stronger guarantees.

## Decision

Keep the conservative adapter unchanged. The separate public action advertises only `self-build.checked-delivery.v1` and requires `checkedDelivery: true` in protected installation configuration. A restricted coding-user bridge uses the existing authenticated daemon and socket; it never starts a second backend or changes login.

Before automatic initial delivery, check the protected workspace receipt, checkout identity, session path, empty turn history and inactive thread. The coordinator separately checks pause, cancellation, policy and original configuration, then commits intent before sending. Only the initial task is automatically sent. Later planning approval, questions, settings and implementation instructions belong to the user in that same app session. Metadata-only resumption supplies no model, reasoning or mode overrides.

A completed native `labstride_report` dynamic tool call is task data. Read it only from the latest completed main-thread turn and bind it to the registered run, checkout, session, turn and commit. Independently verify Git objects, ancestry, branch, clean checkout and nonempty changes. Reject CI workflow changes in this profile and require signed-off commits. Recheck the latest turn immediately before push, PR creation and review readiness. Observe checks on the current PR head, preserving an existing PR's human-edited title and description.

Before native creation, commit the versioned startup selection with its original run, operation, configuration, receipt and source bindings. Recovery reuses those values; a later No agent field edit cannot resolve an unknown native start. Cancellation without a registered session can finish only if there is no native creation intent. An unknown creation remains unresolved.

Every external mutation has a committed intent. A lost response is reconciled read-only where sufficient independent evidence exists, otherwise retained as `outcome_unknown`. An unknown thread start, initial turn or PR creation is never resent. Generic CLI reconciliation is not authority to clear contradictory evidence or manufacture a missing receipt.

## Limits and consequences

There remains a race between the final observation/policy check and the remote effect: a human may start a turn or pause the run in that interval. GitHub field writes also lack atomic CAS. This profile does not advertise atomic session ownership, linearizable approval or exactly-once delivery. Stronger guarantees need provider support and a new versioned capability.

Thread creation can succeed before its reply is lost, leaving an unenrolled thread. The safe result is a blocked run requiring inspection, not a replacement session. An initial delivery that might have arrived is likewise not repeated. Human recovery must preserve original identities and actual outcomes.

The profile can produce a PR while the service keeps observing the same session for follow-up work. It reports Merged only from GitHub's observed merge. Deploy, automatic merge, cleanup, database downgrade and automatic service replacement are outside this delivery.

The [installation guide](../37-local-self-build.md) and [evidence](../evidence/W04-W06-local-self-build-2026-10-24.md) separate implemented behavior from live qualification still required.
