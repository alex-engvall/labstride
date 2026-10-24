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

W01.1 implements [independent durable history](28-durable-coordinator-store.md), immutable cleanup/tombstone references and local path separation. Its [retention tests](evidence/W01.1-retention-2026-10-21.md) remove only test-created directories and retain the full metadata graph. W05.1 below adds local eligibility and inspection evidence. The qualified deletion helper and lost-deletion-acknowledgement recovery remain W05.2 work; AC20 stays `not_run`.

## W05.1 selection and assessment boundary

The optional installation `cleanup` property follows the versioned [cleanup policy](../schemas/cleanup-policy.schema.json). Omission disables cleanup scheduling. The frozen run snapshot selects a trigger (`completion_verified` or `operator_request`), exact installed action ID/version, completion policy and literal workspace-relative ignored-path prefixes. Unknown triggers, traversal, Git metadata declarations, missing pins or missing `cleanup.assess.v1` capability fail preflight. See the [policy example](../examples/cleanup-policy.json). No age-based directory deletion exists.

`completion_verified` creates one assessment request for a completed run; it does not trust the run's terminal state as completion evidence. `operator_request` requires an explicit local-operator request. Both use the same gates. The assessment read cadence uses the configured provider polling interval, not a retention period. Ordinary run execution remains prohibited after completion.

The two initial completion policies are:

- `merge_and_deployment`: independently confirmed merge plus finalized deployment of its actual merge SHA. An earlier superseded deployment may instead use recorded merge-to-successor containment and a currently verified successor pointer. Historical workflow fulfillment alone is insufficient: current target health/revision/resource identity, target holds, outstanding delivery and conflicts are checked again.
- `merge_only`: explicit opt-in for source-only delivery without workflow deployment actions. A current independent merge read must agree with the recorded repository, PR, expected head, base branch and actual merge SHA. Agent reports, session termination, projected status and merged-PR flags without bound independent evidence cannot satisfy this policy.

Local `workspace.keep` defaults to true. A configured remote `controls.keep` is refreshed independently and combined with the local value; either retention control blocks assessment, and an unavailable/unknown configured value remains a blocker. Human takeover, pause/budget/recovery holds, active operations and unresolved outcomes remain effective. Local keep release cannot override remote retention.

All enrolled sessions require fresh provider observations matching their workspace/session and activity identities. Native managed sessions use the additional `cleanup-observe` bridge method: two metadata/turn-summary reads, with no resume, stop, interrupt, turn dispatch or transcript recovery. Idle reads establish only eligibility. They do not fence another human turn, an unmanaged writer or a filesystem mutation. W05.2 must establish quiescence and recheck these gates before removal; an assessment never grants deletion authority.

## Read-only source inspection

The SSH connector version 1.4.0 advertises `cleanup.inspect.v1` and accepts the additive [inspection request v4](../schemas/ssh-cleanup-request.schema.json). Existing v1/v2/v3 messages remain supported. The helper resolves the original creation operation and receipt from protected target state; callers supply no arbitrary path. The response binds installation, target revision, workspace, creation receipt, policy digest and request ID.

Inspection copies a bounded Git metadata snapshot into a newly created private temporary repository, refusing symlinks and unsupported alternate/replacement object graphs. It uses the source checkout only as a read-only work tree, with isolated Git configuration, disabled hooks/external diff/textconv helpers and optional index writes disabled. The original checkout's configuration, index, refs, shallow boundary and source bytes are not changed. Temporary inspection files are disposable; this is not workspace cleanup.

Tracked/staged changes, untracked files and undeclared ignored files block eligibility. Explicit regenerable prefixes apply only to ignored files; an identically named untracked file remains protected. Gitignore alone grants no disposal permission. Submodule and special index flags are conservatively unsupported. Reports expose counts and stable blocker codes, never file contents.

The authorized source remote comes from enrolled helper policy, not checkout remotes. The helper fetches history into the temporary repository, completing shallow history there, and compares the fetched refs with a fresh remote advertisement. HEAD, local refs and reflog/stash history must be reachable from those authorized remote tips. Removed remote branches, unavailable history, malformed metadata, response limits and transport failures block assessment. The initial profile supports the enrolled source remote; it does not infer authorization for another push destination.

## Durable handoff and recovery

Migration 18 adds cleanup requests and immutable content-addressed [decisions](../schemas/cleanup-decision.schema.json), including bounded inspection and independent completion/control/session observations. Requests and decisions bind the original run configuration/generation, ownership context and recovery epoch. Decisions are revalidated transactionally immediately before action assessment. A pending handoff for the same workspace prevents a competing request from invoking another action.

The trusted embedding API enables `startExecution(..., { cleanup: ... })`, supplying the installed host and independent observation ports. The configured SSH inspector is the default target port. Action code still loads only through the existing pinned extension loader and authorization policy. The installed profile wires the remote keep and native metadata reads without changing installation configuration or installing extensions.

The public `labstride.workspace-cleanup` action is deliberately an assessment contribution. It returns `cleanupDisposition: pending_executor`; an alternative pinned assessment action may return `retain`. The original action operation is persisted before invocation. A lost response or process death permits read-only `reconcile` of that operation, never another `start`. These dispositions do not set the workspace to `deleted` or fabricate a deletion receipt. W05.2 (#29) owns the qualified deletion executor, filesystem fencing, protected move and tombstone recovery. Stopping runtime resources remains a separate configured action.

The CLI adds `runs keep RUN_ID true|false` and `runs cleanup RUN_ID` using enrolled local-operator authority. `runs show`/`runs list` include request state, selected operation, current decision, evidence and blockers. Manual cleanup requests require the `operator_request` trigger. These commands queue/inspect work; they cannot authorize deletion through issue text or clear uncertain effects.

There is no down migration. Retain coordinator and target metadata, stop incompatible services before restoring a compatible backup, and reconcile original resource identities. Restoring SQLite cannot undo an external action. Existing installations must explicitly enroll the new connector/action and qualify their actual providers before enabling this optional profile; this change performs no installation or service upgrade.

[Local W05.1 evidence](evidence/W05.1-cleanup-2026-10-24.md) separates tested eligibility/retention and assessment recovery from full deletion and installed/live qualification. AC17/AC18/AC30 retain their full integration gates; AC19/AC20 remain with #29. Existing AC35/AC36 evidence is unchanged.
