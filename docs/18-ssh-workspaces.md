# 18 — SSH connector and workspace contribution

## Connection contract

A target supplies host/port/user references, enrolled host key, approved workspace root, authentication secret reference, permitted commands/capabilities and timeouts. A probe checks identity and required tools without provisioning resources.

Use the system SSH client or a reviewed library selected in W00. Enforce host-key checking. Do not use trust-on-first-use silently, disable host checks or copy private keys into the agent's repository.

Transmit structured payloads over stdin to a fixed versioned target helper. Remote shell construction must not contain issue-provided commands, paths or unchecked values. Use generated opaque directory/branch identifiers; optional human labels are sanitized display metadata only.

## Creating a workspace

The public create action runs in a trusted workflow and calls the SSH connector. Inputs identify workspace, target, source repository and exact base SHA. The target helper claims the workspace operation in an ownership registry outside agent-writable source directories.

Create a temporary owned directory, materialize the exact revision, create a dedicated branch, write a non-secret workspace marker and atomically promote it to its final location. Reconcile a lost response by reading the registry and matching workspace/operation IDs. If a path already exists with different ownership, stop; never adopt it by name alone.

Use a separate clone or an equivalently isolated checkout in the first implementation. Shared mutable working directories are prohibited. Optional object caches must be read-only to consumers and must not carry another repo's credentials.

## Workspace resources

The base requires Git and whatever runtime the target repository declares. Node, PHP, database, queue, proxy and application URL are optional recipe concerns. Record resources individually with provider ID, owner operation and disposal policy.

Running apps need separate ports/data/cache namespaces. A workspace root is a configuration value, not a fixed /var/www or control-panel path. Repos from another host provider require a suitable source adapter; GitHub is the first one implemented.

## Active users

Register active agent/helper/interactive use before cleanup. The pilot cannot guarantee that arbitrary unmanaged shell users have no open handles. Owned-process checks plus explicit keep are required, and the operator must use keep for manual work outside managed session tracking. Document this limitation.
