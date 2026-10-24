# Public runtime recipe profiles

`node-resources.mjs` is an operator-installed, framework-independent example driver for Node 24/Linux. Its SQLite profile creates a real private database; its HTTP profile creates a real loopback-only Node service with a separate allocated port. Neither executes the checkout. The HTTP service remains running until an explicit operator/cleanup action stops it.

Install the reviewed driver outside writable source directories and pin its SHA-256 bytes in a [recipe](../runtime-recipe.json). Create a protected mode-0700 runtime root, enroll a [v3 helper policy](../ssh-runtime-installation.json), package/pin the [public action](../../packages/action-runtime-create/extension.json) and SSH connector 1.2.0, and compose a runtime operation after a successful source checkout. The example JSON values are illustrative, not ready-to-install credentials or path identities.

The `configuration` object selects `kind: "sqlite"` or `kind: "http"` and the protected `root`. Configure one `database` slot for SQLite, or one `url` slot for HTTP. The pinned recipe chooses its cleanup action/version/trigger; executing that cleanup is separate work. Never place a driver in a coding-writable checkout, pass credentials through receipts or run this HTTP example as an application-source server.

See [the runtime contract and recovery limits](../../docs/36-recipe-owned-runtimes.md) and [execution evidence](../../docs/evidence/W03.3-runtimes-2026-10-24.md).
