# 20 — Directory cleanup contribution

Cleanup is an action selected by configuration. The core schedules and records it; no fixed seven-day deletion timer is built in.

The first contribution deletes one owned workspace directory. It may run through the generic GitHub workflow action and SSH connector. Stopping an optional application runtime is a separate configured action. Removing cloud resources, databases, repositories or remote branches is outside this contribution.

## Eligibility

The first pilot schedules cleanup after merge and verified deployment, including a verified successor release containing the merge when the original deploy was superseded. Repositories without deploy have to configure their own explicit completion policy.

Immediately before deletion require:

- Matching installation/workspace/operation ownership in the coordinator and target registry.
- Workspace below the enrolled root; root itself, parent paths, symlink escapes and unexpected mounts rejected.
- Keep is false, all managed sessions are idle/stopped, and the workspace deletion lock is held.
- No modified tracked files, untracked work or local commits that have not been pushed to an authorized remote.
- The completion evidence still matches this run generation and source history.

Ignored files can contain valuable work. Treat undeclared ignored paths as blockers; only declared regenerable build/cache files may be removed automatically. A .gitignore entry alone does not prove a file is disposable.

## Algorithm requirements

Use a trusted target helper that verifies ownership and quiescence, resolves the path safely and atomically moves the owned directory into a protected deletion area before recursive removal. Protect against symlink replacement and concurrent writes; an advisory coordinator lock alone does not protect the filesystem.

If safe quiescence cannot be established, report cleanup_blocked and preserve the directory. Once moved/deleting, new sessions must be denied. Keep a durable tombstone outside the removed directory. Repeated requests for the same proven-deleted workspace return the original success; an unrecognized missing path is not automatically a verified deletion.

Preserve run/PR/deploy evidence in the coordinator after deletion. Report blockers with safe filenames/counts, not file contents. Never resolve a blocker by silently discarding changes or force-pushing.

## Implemented metadata boundary

W01.1 implements [independent durable history](28-durable-coordinator-store.md), immutable cleanup/tombstone references and local path separation. Its [retention tests](evidence/W01.1-retention-2026-10-21.md) remove only test-created directories and retain the full metadata graph. W05.1 below adds local eligibility and inspection evidence. W05.2 adds the qualified deletion executor and original-operation recovery described below. Its local evidence does not pass the full installed AC19/AC20 scenarios.

## W05.1 selection and assessment boundary

The optional installation `cleanup` property follows the versioned [cleanup policy](../schemas/cleanup-policy.schema.json). Omission disables cleanup scheduling. The frozen run snapshot selects a trigger (`completion_verified` or `operator_request`), exact installed action ID/version, completion policy and literal workspace-relative ignored-path prefixes. Unknown triggers, traversal, Git metadata declarations, missing pins or missing `cleanup.assess.v1` capability fail preflight. See the [policy example](../examples/cleanup-policy.json). No age-based directory deletion exists.

`completion_verified` creates one assessment request for a completed run; it does not trust the run's terminal state as completion evidence. `operator_request` requires an explicit local-operator request. Both use the same gates. The assessment read cadence uses the configured provider polling interval, not a retention period. Ordinary run execution remains prohibited after completion.

The two initial completion policies are:

- `merge_and_deployment`: independently confirmed merge plus finalized deployment of its actual merge SHA. An earlier superseded deployment may instead use recorded merge-to-successor containment and a currently verified successor pointer. Historical workflow fulfillment alone is insufficient: current target health/revision/resource identity, target holds, outstanding delivery and conflicts are checked again.
- `merge_only`: explicit opt-in for source-only delivery without workflow deployment actions. A current independent merge read must agree with the recorded repository, PR, expected head, base branch and actual merge SHA. Agent reports, session termination, projected status and merged-PR flags without bound independent evidence cannot satisfy this policy.

Local `workspace.keep` defaults to true. A configured remote `controls.keep` is refreshed independently and combined with the local value; either retention control blocks assessment, and an unavailable/unknown configured value remains a blocker. Human takeover, pause/budget/recovery holds, active operations and unresolved outcomes remain effective. Local keep release cannot override remote retention.

All enrolled sessions require fresh provider observations matching their workspace/session and activity identities. Native managed sessions use the additional `cleanup-observe` bridge method: two metadata/turn-summary reads, with no resume, stop, interrupt, turn dispatch or transcript recovery. Idle reads establish only eligibility. They do not fence another human turn, an unmanaged writer or a filesystem mutation. The W05.2 executor establishes a filesystem fence and rechecks these gates before removal; an assessment alone never grants deletion authority.

## Read-only source inspection

The SSH connector version 1.4.0 advertises `cleanup.inspect.v1` and accepts the additive [inspection request v4](../schemas/ssh-cleanup-request.schema.json). Existing v1/v2/v3 messages remain supported. The helper resolves the original creation operation and receipt from protected target state; callers supply no arbitrary path. The response binds installation, target revision, workspace, creation receipt, policy digest and request ID.

Inspection copies a bounded Git metadata snapshot into a newly created private temporary repository, refusing symlinks and unsupported alternate/replacement object graphs. It uses the source checkout only as a read-only work tree, with isolated Git configuration, disabled hooks/external diff/textconv helpers and optional index writes disabled. The original checkout's configuration, index, refs, shallow boundary and source bytes are not changed. Temporary inspection files are disposable; this is not workspace cleanup.

Tracked/staged changes, untracked files and undeclared ignored files block eligibility. Explicit regenerable prefixes apply only to ignored files; an identically named untracked file remains protected. Gitignore alone grants no disposal permission. Submodule and special index flags are conservatively unsupported. Reports expose counts and stable blocker codes, never file contents.

The authorized source remote comes from enrolled helper policy, not checkout remotes. The helper fetches history into the temporary repository, completing shallow history there, and compares the fetched refs with a fresh remote advertisement. HEAD, local refs and reflog/stash history must be reachable from those authorized remote tips. Removed remote branches, unavailable history, malformed metadata, response limits and transport failures block assessment. The initial profile supports the enrolled source remote; it does not infer authorization for another push destination.

## Durable handoff and recovery

Migration 18 adds cleanup requests and immutable content-addressed [decisions](../schemas/cleanup-decision.schema.json), including bounded inspection and independent completion/control/session observations. Requests and decisions bind the original run configuration/generation, ownership context and recovery epoch. Decisions are revalidated transactionally immediately before action assessment. A pending handoff for the same workspace prevents a competing request from invoking another action.

The trusted embedding API enables `startExecution(..., { cleanup: ... })`, supplying the installed host and independent observation ports. The configured SSH inspector is the default target port. Action code still loads only through the existing pinned extension loader and authorization policy. The installed profile wires the remote keep and native metadata reads without changing installation configuration or installing extensions.

The frozen `labstride.workspace-cleanup` 1.0.0 contribution supports assessment only. It returns `cleanupDisposition: pending_executor`; an alternative pinned assessment action may return `retain`. The original action operation is persisted before invocation. A lost response or process death permits read-only `reconcile` of that operation, never another `start`. These dispositions do not set the workspace to `deleted` or fabricate a deletion receipt. The optional 1.1.0 capability below provides a separate qualified deletion operation. Stopping runtime resources remains a separate configured action.

The CLI adds `runs keep RUN_ID true|false` and `runs cleanup RUN_ID` using enrolled local-operator authority. `runs show`/`runs list` include request state, selected operation, current decision, evidence and blockers. Manual cleanup requests require the `operator_request` trigger. These commands queue/inspect work; they cannot authorize deletion through issue text or clear uncertain effects.

There is no down migration. Retain coordinator and target metadata, stop incompatible services before restoring a compatible backup, and reconcile original resource identities. Restoring SQLite cannot undo an external action. Existing installations must explicitly enroll the new connector/action and qualify their actual providers before enabling this optional profile; this change performs no installation or service upgrade.

[Local W05.1 evidence](evidence/W05.1-cleanup-2026-10-24.md) separates tested eligibility/retention and assessment recovery from full deletion and installed/live qualification. AC17/AC18/AC30 retain their full integration gates; AC19/AC20 retain the installed qualification gates recorded in the W05.2 evidence. Existing AC35/AC36 evidence is unchanged.

## W05.2 qualified deletion executor

The public cleanup action 1.1.0 adds `cleanup.execute.v1`; SSH connector 1.5.0 adds `cleanup.delete.v1`. Frozen assessment-only pins and retaining actions continue their earlier behavior. Execution requires a trusted deletion transport and an explicitly qualified helper policy containing `cleanup: {"profile":"linux-exclusive-writers.v1"}`. Omission leaves deletion unsupported. This repository change does not enroll that policy, replace installed artifacts, elevate a helper or enable cleanup on an existing installation.

The initial Linux profile requires a root helper distinct from the coding UID, host process visibility and protected root/state ancestry. Qualification must establish the host PID/user/mount namespace and complete proc access; container-local visibility is insufficient. Runtime checks reject observable namespace restrictions, hidden/inaccessible/changing process inventories and every unprivileged process, including unrelated processes. They never kill a writer. This deliberately restrictive profile preserves directories when it cannot prove quiescence; idle session observations, permission changes alone and a process snapshot with unreadable entries cannot qualify it. Root/helper code remains trusted and must respect the fence. Broader shared-host/process-isolation support requires a separately qualified profile.

The coordinator records a separate immutable deletion operation before invocation and reserves the workspace as `cleanup_pending`. Ordinary operation claims and new managed attachments are denied. The target also reserves deletion ownership transactionally against runtime-driver use; interrupted runtime use remains a blocker until its original operation is reconciled. Its registry and serialization lock live in protected target state, outside the source tree. A SQLite lock serializes target deletion calls and is released by process death; durable ownership never expires because a timer or session ended.

[Helper requests v5](../schemas/ssh-cleanup-delete-request.schema.json) provide `prepare`, `inspect`, `commit` and `release`. They carry a digest-bound operation with [deletion inputs v2](../schemas/cleanup-delete-input.schema.json), identifying the original creation receipt and policy, never an arbitrary path. Replies bind the same installation, target revision and operation. Preparation verifies the original wrapper, checkout and marker, persists intent, changes the wrapper to helper-only access, proves quiescence and inspects both the complete wrapper and Git history. Unexpected wrapper entries, foreign ownership, hardlinks, nested directory/file mounts and unsupported objects block removal. Internal symlinks are unlinked as entries and never traversed.

A [preparation receipt](../schemas/cleanup-preparation.schema.json) records the bound Git inspection under the fence. The coordinator refreshes merge/deployment, retention and session evidence, then revalidates local context, policy, generation, recovery epoch and freshness transactionally. Its commit authorization is recorded before dispatch and binds the preparation digest with a maximum 30-second expiry. The trusted connector rechecks the local authorization immediately before invocation. The helper repeats ownership, writer and Git checks and refuses expired operations or authorization before movement.

The helper creates a mode-0700 deletion area beneath the enrolled root, checks the same filesystem/mount, persists its identity and a moving intent, then atomically renames the original wrapper into an operation-derived destination. Source and destination parents are synced. Recursive removal uses held descriptors, no-follow entry opens and device/mount checks; the complete remaining tree is checked before unlinking begins. Unrelated entries in the deletion area are never removed. A final immutable [tombstone](../schemas/cleanup-tombstone.schema.json) is committed outside the removed directory before acknowledgement. See synthetic [request](../examples/ssh-cleanup-delete-request.json), [response](../examples/ssh-cleanup-delete-response.json) and [tombstone](../examples/cleanup-tombstone.json) examples.

## Deletion recovery and operational limits

Coordinator migration 19 adds retained deletion operations, authorization and observations. Target registry version 3 adds deletion ownership, preparation, area identities, tombstones and runtime-use reservations while retaining v1/v2/v3/v4 wire compatibility. The existing CLI cleanup views include these phases, blockers and tombstones. A definite pre-move blocker or release restores access only after proving the original directory and records retention. It cannot clear a moved or uncertain resource.

A lost prepare/commit response never causes another action start or commit. Recovery inspects the original operation through the trusted connector independently of the action result. A prepared operation can proceed only with fresh eligibility; an interrupted pre-move invocation without usable authorization is retained/released. If a moving intent exists but the protected destination is absent, the helper keeps `move_unknown` and the fence for operator investigation; it never retries the rename from the original locator. An undelivered prepare with no target record also remains uncertain. New cleanup requests cannot bypass an unresolved owner.

Once movement is observed, reconciliation may finish removal only of the recorded directory in the recorded deletion area. A durable removing phase plus that area's original identity permits an absent destination to finalize the tombstone after a crash between removal and recording. Unrecognized source absence proves nothing. A completed duplicate returns the original tombstone without revisiting the former locator; a replacement there survives. The coordinator marks `deleted` only after independent target inspection, appending cleanup evidence and preserving all earlier history. Completion reconciliation continues even if later holds prevent new effects.

Removal cannot be rolled back. Before movement, a confirmed release can restore access; after movement, retain protected state and reconcile the original identity. There is no down migration, automatic lock takeover, automatic retry of an uncertain effect or restore command that recreates removed files. A stopped-service backup must match compatible code and cannot reverse deletion. External runtime disposal remains a separate configured action.

[W05.2 local evidence](evidence/W05.2-deletion-2026-10-24.md) records actual removal and helper/coordinator SIGKILL recovery. Successful-removal fixtures inject a trusted quiescence seam and local source transport; they do not prove a qualified installed root helper. Privileged mount/ownership/writer and real SSH cases remain unexecuted where unavailable. LS-CLN-004/005 are implemented for this bounded profile, not verified for installed use. Full AC17/AC18/AC19/AC20/AC30 and the existing AC35/AC36 integration evidence remain separate.
