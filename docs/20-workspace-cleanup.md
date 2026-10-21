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

W01.1 implements [independent durable history](28-durable-coordinator-store.md), immutable cleanup/tombstone references and local path separation. Its [retention tests](evidence/W01.1-retention-2026-10-21.md) remove only test-created directories and retain the full metadata graph. The production eligibility checks, trusted target helper and lost-workflow-acknowledgement recovery above remain W05 work; AC20 stays `not_run`.
