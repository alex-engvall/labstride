# 07 — Lifecycle, concurrency and recovery

Do not encode all facts in one status column. Runs, workspaces, agent sessions, PRs and deployments have independent state.

| Entity | States |
| --- | --- |
| Run | queued, preparing, ready, active, waiting_human, waiting_ci, delivering, completed, paused, failed, cancelled, outcome_unknown |
| Workspace | requested, creating, ready, in_use, retained, cleanup_pending, deleting, deleted, error, outcome_unknown |
| Operation | prepared, claimed, running, succeeded, failed, cancelled, outcome_unknown |
| Deployment | requested, running, verified, failed, outcome_unknown |

Paused is a scheduling overlay: preserve the prior phase/checkpoint. A failed run can be continued only by a recorded recovery action. Completed means its configured completion conditions are verified, not merely that an agent said it was done.

W01.1 persists these independent facts through the [durable store](28-durable-coordinator-store.md). W01.2 adds durable intent scheduling, claims, one-time effect boundaries and adapter-driven reconciliation. Production provider integration and the broader W01.3 scheduling/stop policy remain separate work.

## Invariants

- One live workspace per run, and at most one active run for the same issue in the pilot. Reopening creates a new generation only after explicit start; it never resurrects a deleted path silently.
- One source repo and dedicated branch per workspace. Parallel issues never share a working directory. Optional runtime ports, databases and cache namespaces are separately allocated.
- A terminal receipt is immutable. A correction is another audit record, not a rewrite.
- Unknown outcomes are not eligible for automatic re-execution.
- A lease expiry does not prove a remote process stopped. Block new conflicting effects until reconciliation and use target fencing where supported.
- Merge/cleanup do not implicitly destroy external runtime resources or branches.

## Side-effect boundary

Persist intent before dispatch. Record the executor claim before permitting the effect. Record the result after verifying it. A crash can still occur between an external effect and receipt persistence. The state becomes outcome_unknown; no claim of general exactly-once delivery is made.

| Failure point | Required recovery |
| --- | --- |
| Before intent commit | No effect allowed; event can be evaluated again |
| After commit, before dispatch | Dispatcher resumes the same operation |
| Dispatch response lost | Search/observe matching workflow; never dispatch blindly |
| Workspace created, receipt lost | Inspect owned resource registry and adopt exact workspace |
| Agent turn response lost | Observe same thread/turn; do not send the prompt again |
| Hook missing, duplicated or late | Re-observe enrolled session/target; deduplicate and reject stale progress without restarting work |
| GitHub progress write fails | Retain the same projection intent; refresh current human/provider state before retrying |
| Deploy result uncertain | Read workflow and target release identity; retain workspace |
| Directory removed, receipt lost | Verify absence under owned target and finalize same operation |

## Parallel delivery

CI attaches to a specific PR head. Before merge, refresh head/base, checks and protection state. Any source change invalidates earlier evidence. Serialize merge decisions per base branch or use a provider-supported queue after verifying its semantics. After each merge, revalidate the next PR against the changed base.

Serialize deployments by environment. Each queued deployment records the expected predecessor and source SHA. An older pending revision must not overwrite a newer verified deployment. Default to marking an older queued revision superseded; retain explicit source/deployment traceability. Cleanup may use a verified successor only if it proves the relevant merge is included.

## Stop, cancel and timeout

Pause forbids new effects while observation continues. Cancel requests stop through declared capabilities and preserves resources by default. A running deployment is not assumed rolled back when its workflow is cancelled. A cleanup attempt that has crossed deletion's effect boundary cannot be undone; report its observed result.

Design defaults: a 24-hour unattended-run limit and at most three automatic CI repair attempts. Repeated identical failures or unclear outcomes pause earlier. Plan approval has no forced timeout into implementation.

Agent turn-stop and session-end observations are not run completion. An explicit human interruption cannot be undone by a hook requesting automatic continuation. Automatic continuation uses the session provider's current human/turn guards and installation budgets, not an unbounded hook loop. Missing atomic guards must pause/report the unsupported guarantee.

## W01.3 capacity implementation

The trusted start plan optionally declares `capacityClass` (`development` by default or `ciReview`). `configureScheduling` accepts a versioned policy with `activeRuns`, `development` and `ciReview`, all positive bounded integers. The installation schema permits the two optional class limits; its compiler must inherit `activeRuns` when absent. The initial standalone store policy is two for all three limits. Only trusted installation composition configures this policy, never issue facts.

Admission uses one SQLite write transaction, durable queue order and a persistent reservation per run. Paused/waiting admitted runs retain global capacity; finishing an individual operation does not complete its run. Active/uncertain claims retain class capacity. Only terminal runs with no unresolved operations stop consuming global capacity. Lower limits drain existing reservations and admit no new conflicting work. One active forward operation per run is permitted. Two issues cannot share workspace locator/path or repository branch.

An issue key uses provider, repository and canonical issue identity across installation snapshots. Identical start delivery returns its original run; another generation while a prior run is live/uncertain returns `issue_busy`. The database migration preserves legacy conflicts and the inspector; neither conflicting run acquires a new effect permission. No expiry unlocks a claim.

Action `tick` pumps a bounded set of jobs and returns without waiting for long-running effects; `drain` waits for the current jobs and `close` prevents new jobs before draining. The embedding application continues to invoke ticks. Observations are composed alongside action ticks. There is no background service or forced remote shutdown. Capacity waits remain pending without spending retry attempts. Local checkout evidence does not qualify SSH AC08.

## W01.3 trusted run controls

`pauseRun`, `resumeRun` and `cancelRun` accept the versioned run-control schema and an authorized, evidence-bearing audit context. Control IDs are durable and idempotent; different content or authorization under an existing ID conflicts. The run revision is compared atomically. Authentication/transport and operator CLI wiring remain W02/W06 responsibilities. Generic lifecycle writes, including calls through the base store, cannot change a bound run's pause flag or terminate unresolved work.

Pause preserves phase/checkpoint and global admission. New action effects and projection writes stop; observations and receipts continue. Waiting under pause consumes no retry budget. Resume clears operator pause only; it cannot reverse cancellation or restore/resource holds. A consumed claim cannot execute again. Explicit cancellation is a separate permitted stop effect, not forward work.

Before the original effect boundary, cancellation marks pending work cancelled locally and retires claims. After the boundary, the coordinator persists a stop intent and uses an optional adapter `cancel(request, originalHandle, controlId)` in a separate bounded lane. An accepted stop is only requested, not confirmed cancellation. Unsupported stops and missing handles are reported/preserved while original-effect observation continues. Submission is persisted once before invoking the adapter; submitted/uncertain stops are never automatically resent, including after a crash. `controlStatus` reports an interrupted submitted request as outcome_unknown.

Original operation results remain authoritative and immutable. Successful work can finish after cancellation. The run reaches cancelled only after every original operation has a known terminal result; unresolved runs retain reservations and resources. No cancellation rolls back a deployment or deletes a workspace. Migration v7 preserves existing control/pause facts; no down migration is provided.
