# 34 — Exact-revision workspaces and creation recovery

W03.2 / [#22](https://github.com/engshort/labstride/issues/22) implements the source-checkout portion of LS-SSH-003/004. Acceptance evidence must distinguish actual Git, isolated HTTPS/SSH servers, the enrolled pilot and the actual interactive client. Runtime recipes remain W03.3; cleanup remains W05. Full AC36 requires the integrated client/human-turn proof.

## Installed action and trusted composition

Package `packages/action-workspace-create` with `scripts/package_extension.mjs` and pin its artifact as `labstride.workspace-create@1.0.0`. Its versioned [inputs](../schemas/workspace-create-input.schema.json) contain `target`, `rootId` and the original `source` (repository ID/name and exact SHA). Inputs must agree with the immutable operation envelope. Inputs cannot supply commands, URLs, credentials, paths, extension code or service objects.

`startExecution(..., {installedTargets: {host}, ...})` registers the installed action through the ordinary worker. The original run snapshot selects the action and SSH connector artifacts, configuration, grants and enrollment revision. An effect-free workspace probe checks helper capabilities before the worker crosses its effect boundary. Retired enrollment, altered artifacts and unsupported helpers fail closed.

The loader's optional third argument supplies trusted runtime services to `createExtension(configuration, services)`. Existing one-argument factories remain compatible. This action receives only the validated workspace connector port; neither workflow JSON nor issue fields construct services. The action has `filesystem.workspace`; its separately pinned connector needs `network.ssh`. Installed extensions remain trusted code, not an OS sandbox.

`prepareWorkspaceStart(plan, installationId)` derives the locator, branch and ownership reference before admission registers immutable descriptors. The locator hashes installation/target/workspace identity; the branch is `labstride/<locator>`. The resulting checkout is `<enrolled-root>/<locator>/source`. Coordinator `localPath` remains null for a remote workspace. A provider's duplicate generation must retain its original run/workspace IDs.

The trusted action declares `createsWorkspace`. The worker records preparation at the existing effect boundary. A successful correlated receipt, workspace readiness, run readiness and retained resource inventory commit in one transaction. A forged receipt rolls back that transaction. Preparation does not imply success; uncertain operations reconcile through their original identities.

## Helper configuration and source access

The [v2 policy](../schemas/ssh-workspace-policy.schema.json) retains installation, target, root and separate helper/coding identities. It additionally selects a dedicated coding group and an allowlist of source repository IDs, canonical names, HTTPS Git/API addresses and optional helper-owned, mode-0600 source-credential files. The helper must belong to the selected group. The coding account must also be enrolled into that group by the operator; it must not gain the helper's private group or state access.

The [v2 request](../schemas/ssh-workspace-request.schema.json), [response](../schemas/ssh-workspace-response.schema.json) and [receipt](../schemas/ssh-workspace-receipt.schema.json) are separate from the v1 reservation wire contract. SSH connector 1.1.0 supports both; old pinned connector artifacts and v1 replies retain their original shape and capability list. Keep original artifacts available for active snapshots.

Before creating anything, an independent bounded HTTPS API read checks the configured repository ID, canonical name and clone URL. Redirects are rejected. Public sources use anonymous access; private sources use an independently enrolled source-read credential. Source credentials must not be projection/deploy credentials. Their scope and expiry are operator responsibilities and require separate live qualification.

Git receives argument arrays and a minimal environment. Global/system configuration, credential helpers, templates, repository hooks, recursive submodules and implicit branch-tip fallback are disabled. Authentication is scoped to the configured Git URL in child-process configuration; it never enters argv, origin URLs, checkout config or receipts. An optional `NODE_EXTRA_CA_CERTS` setting belongs to the protected launcher; the helper checks its protected file and supplies the same CA to Git. It is never taken from a request.

No project build, package install, LFS materialization, recursive submodule checkout or runtime setup is part of this action. An unavailable exact commit remains an unresolved retained creation; it never becomes a checkout of a newer branch tip.

## Journal, publication and coding access

The protected target registry migrates additively from schema 1 to 2, retaining the target identity and immutable reservation rows. A unique operation/workspace creation row records the original request and digest before staging. Matching prior reservations must belong to the same run/root. Foreign paths, foreign reservations and different digests are preserved and refused.

Materialization uses a private staging wrapper and an independent Git database. Git fetches the exact commit and creates the generated branch. A protected non-secret marker and the registry receipt bind operation/source/root, wrapper and checkout device/inode/mount/UID identities. The helper persists the materialized receipt before publishing the wrapper under the enrolled root. The protected parent and unique registry claim exclude another managed publisher; publication never intentionally replaces an existing destination.

Only the checkout is group writable. Its wrapper and marker remain helper owned, with group read/traverse access after handoff. The coding identity cannot replace the top checkout directory or rewrite the ownership marker. Configure ordinary Git trust for each exact approved checkout path under the coding user's settings; never grant `safe.directory=*`. Workloads sharing that coding UID are not mutually sandboxed.

An interrupted stage is retained. There is no automatic directory deletion, overwrite, new locator, lock takeover or repeated Git materialization. Existing unmanaged or uncertain resources require operator investigation.

## Reconciliation and limits

Inspection reads only the original registry row, protected marker and top directory identities. Once coding access is granted it never executes Git, follows source-content links or resets the branch/working tree. Later human edits and commits survive reconciliation; the receipt attests initial materialization, not a permanently unchanged HEAD.

A complete accessible publication can recover its original success even if the process died before storing the final acknowledgement. An absent receipt, partial staging, inaccessible publication, changed identity or failed inspection preserves uncertainty at the coordinator. Inspection cannot clone, promote staging or grant coding access. The operator must retain and investigate incomplete creation; a timeout alone grants no replay.

The implementation fsyncs marker/directory metadata and uses SQLite synchronous commits. Process-kill tests are not power-loss or storage-hardware qualification. There is no down migration. Before upgrade, pause effects and take a consistent protected backup. After schema 2 or an uncertain effect exists, retain a compatible inspector; restoring an older database/release cannot undo a created checkout.

The full AC08/AC09 Linux profile and AC36 status belong in [the evidence record](evidence/W03.2-workspaces-2026-10-23.md), not inferences from schema/type/doc checks.

## Explicit operator probe

`scripts/probe_workspace.ts` accepts a protected [v1 probe descriptor](../schemas/workspace-probe.schema.json). Inspection is the default. An explicit `--dispatch` can cross the first durable dispatch boundary once; repeated invocations, including repeated `--dispatch`, only inspect a previously dispatched operation. The local journal binds the original descriptor/profile even before dispatch. Its output always labels application acceptance unverified: this tool is not GitHub admission or the integrated AC36 proof.
