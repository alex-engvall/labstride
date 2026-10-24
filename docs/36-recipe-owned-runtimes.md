# 36 — Recipe-owned optional application runtimes

W03.3 / [#23](https://github.com/engshort/labstride/issues/23) implements LS-SSH-005 through a separate public action. Source creation does not install, select or start a runtime. An installation without any runtime recipe still uses the original source-only action. Application frameworks, database engines, process managers, proxies and hosting panels remain recipe concerns.

## Implementation plan and boundary

1. Define versioned recipe, input, driver and receipt contracts; pin the public action and installed connector.
2. Join the existing protected source registry, claim/effect boundary and durable worker. Allocate names before invoking a recipe; recover only by inspecting the original operation.
3. Supply public SQLite and loopback HTTP recipes; verify their actual independent resources, process interruptions and source-only operation without an agent.
4. Update specification, requirement/checklist and scoped AC30 evidence together. Keep cleanup execution with W05, general ordered workflow advancement with W04 and installed service operation with W06.

This is a trusted embedding API and public extension contribution, not automatic activation of an installed daemon. Evidence distinguishes local subprocess tests from the separately executed installed Linux/SSH and role-isolation qualification; that qualification does not activate the shared launcher or general workflow service.

## Action and recipe pins

Package `packages/action-runtime-create` with `scripts/package_extension.mjs`. Pin `labstride.runtime-create@1.0.0` and SSH connector `1.2.0` in the run's original extension lock. The installed composition is registered by `startExecution(..., { installedTargets: { host }, ... })`; JSON cannot construct the runtime service port. Source-only use needs neither a session provider nor an agent account.

The [action input](../schemas/runtime-create-input.schema.json) selects only an enrolled target/root, the original source-creation operation ID and a recipe ID/version/digest. It cannot supply an executable, command, URL, credential or filesystem path. The configured action checks the original successful source operation and ready/in-use/retained workspace before effects. The helper independently resolves the source request from its protected registry and inspects its published directory identity. It checks run/workspace/root/source correlation; a GitHub Path edit or caller-supplied receipt cannot enroll a checkout.

A [recipe](../schemas/runtime-recipe.schema.json) declares a protected driver path and byte integrity, operator-installed configuration, a bounded timeout, named resource slots/types, and a disposal declaration. The canonical recipe digest covers all these fields. IDs, versions and inputs are validated before admission/effects. New recipe content requires a new pin; retain the old recipe/version and driver bytes while its operations need inspection.

`runtimeNamespace` hashes installation, target, workspace and the complete recipe pin. Each slot receives `<namespace>-<slot>`; names are independent of issue titles and operation retries. Another operation cannot claim the same workspace/recipe namespace. Reordering JSON keys cannot allocate a different namespace. A deliberate different recipe pin allocates another namespace; it does not replace the old resources.

## SSH helper installation and compatibility

The [v3 installation](../schemas/ssh-runtime-installation.schema.json) wraps the unchanged v2 workspace policy and a separate [runtime policy](../schemas/ssh-runtime-policy.schema.json). The runtime registry directory must be protected, mode 0700 and separate from workspace roots and the source registry. Policy identities must agree. Drivers must have protected non-symlink ancestry and match their enrolled byte integrity; do not install them in a writable checkout. Drivers execute as the trusted helper identity, not as untrusted project code. An operator must review any recipe that executes source or receives service credentials and provide the required separate workload identity/isolation; the example recipes never execute source.

The helper and connector carry separate [v3 requests](../schemas/ssh-runtime-request.schema.json) and [responses](../schemas/ssh-runtime-response.schema.json). Original v1 reservations and v2 workspace requests/replies retain their shapes and capability lists, including under a v3 installation. Existing pinned artifacts remain available for active snapshots. Runtime support is advertised only through `runtime.probe.v1`, `runtime.create.v1` and `runtime.inspect.v1`.

The existing `target.sqlite` stays at schema 2. A separate additive `runtimes.sqlite` schema 1 records target identity and immutable operation, recipe, namespace and binding descriptors. It has no delete API or automatic down migration.

## Driver hooks and resource evidence

A recipe supplies `create` and `inspect` hooks through the [driver request](../schemas/runtime-driver-request.schema.json) and [reply](../schemas/runtime-driver-reply.schema.json). The helper invokes the protected Node module in a separate bounded process using an argument array, JSON stdin and a minimal environment. The request contains the generated binding, registered source receipt/path and trusted recipe configuration. It contains no source-read credential or issue-selected command. Driver stdout is a bounded typed reply; stderr is bounded and never returned as diagnostics.

The helper persists the intent before invoking `create`. A timeout, process death, invalid reply or lost transport response retains uncertainty. A duplicate request can invoke only `inspect`, never `create` again. Inspection cannot allocate an alternative namespace. Incomplete resources, foreign paths and contradictory evidence remain retained and require operator investigation.

A ready reply must bind the original allocation digest and exactly the declared resource names/types, with no duplicates. Optional URL outputs accept only HTTP(S) without embedded credentials. Never return service credentials or private source content in resource locators or evidence. An [owned runtime receipt](../schemas/runtime-receipt.schema.json) binds operation/request, source receipt digest, recipe pin, namespace, individual resource locators and disposal declaration. Concurrent terminal observations must agree. A committed receipt attests original creation; cached success does not promise current process health. Health monitoring/restart is a separate recipe action.

The normal action worker handles claims, effect fencing, uncertain outcomes and recovery. Its existing result transaction registers each resource with the creating operation, workspace ownership and conservative `retain` policy. The full recipe disposal declaration is retained in the operation result's `outputs.runtime`. A declaration selects no privileged cleanup by itself.

## Public runnable profiles

[The public driver](../examples/runtime-recipes/node-resources.mjs) has two configurations:

| Profile | Actual resource | Example cleanup trigger |
| --- | --- | --- |
| `sqlite` | Independent SQLite database with protected ownership evidence | `workspace.completed` |
| `http` | Independent Node HTTP process bound only to loopback, with an allocated port and correlated HTTP response | `operator.request` |

Each uses an operator-created protected `configuration.root`; no project setup, dependency install, hooks or control-panel call occurs. The HTTP profile is an infrastructure example that returns namespace/ownership information; it does not serve application source or expose a public route. A proxy, application server, shared database service or framework build must supply its own reviewed recipe. The example driver retains incomplete directories and refuses symlinks/pre-existing paths. Its inspect hook checks actual SQLite ownership or HTTP/process evidence without restarting the process.

See the [installation example](../examples/ssh-runtime-installation.json), [recipe example](../examples/runtime-recipe.json) and [input example](../examples/runtime-create-input.json). Paths, identities and integrity values are illustrative; enroll real protected paths and actual driver/artifact byte hashes before use. Recipes are installed deliberately, never downloaded or enabled by an issue.

## Cleanup, rollback and acceptance limits

Stopping/deleting runtime resources requires a separately configured public action and policy authorization. W03.3 registers the selected action/version/trigger but does not implement W05 deletion or W04 trigger execution. There is no timer, implicit service stop or cleanup on failed health. A recipe can use another cleanup trigger without changing core; AC30's full cleanup behavior remains with LS-CLN-001/W05.

Before upgrade, pause effects and take consistent protected backups. Retain both registries, original pinned artifacts, recipes, source checkouts and runtime resources. An old release cannot reconcile v3 runtime effects; keep a compatible inspector until all unknown operations are resolved. Rollback does not remove a database, kill an app or undo external effects. Process-kill evidence does not qualify power-loss durability, multi-tenant isolation or another operating system. See the [execution evidence](evidence/W03.3-runtimes-2026-10-24.md).
