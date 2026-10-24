# 19 — Deployment action and recipes

The [workflow action](38-workflow-broker.md) invokes an operator-selected GitHub Actions workflow. Its optional W04.2 deployment profile combines authenticated workflow completion with independent target revision/health observations. [Local implementation evidence](evidence/W04.2-deployment-verification-2026-10-24.md) is separate from live Actions, installed-target and full cleanup/recovery acceptance. Core does not know Laravel, Cloudflare, systemd, a hosting panel, a database engine or a production directory.

Development runtime preparation is a separate [recipe-owned runtime action](36-recipe-owned-runtimes.md). Its database/service/URL resources do not attest a production deployment.

## Required recipe contract

Declare source repository, allowed source revision policy, workflow identity, target environment, inputs, build/artifact verification, health verification and rollback/recovery capability. Deployment output includes deployed revision or immutable artifact identity, target resource identifier, safe URL if appropriate and health result.

An application SHA and workflow SHA may differ; persist both. If an artifact is built earlier, bind its source SHA and content digest. A mutable tag alone is not deployment identity.

## Enrollment and observer boundary

An optional `deployment` property on the frozen workflow enrollment follows the versioned [deployment profile](../schemas/deployment-profile.schema.json). It declares recipe ID/version/content digest, observer ID/version/configuration, observation limits and recovery policy. See the [profile example](../examples/deployment-profile.json) and [complete enrollment example](../examples/workflow-deployment-enrollment.json). These are illustrative settings, not installed or qualified recipes. Existing enrollments without this property keep workflow-only behavior and cannot create verified deployments. Configuration changes never rebind existing operations.

The trusted embedding API accepts `startExecution(..., { workflowBroker: { host, provider, port, observers } })`. `observers` is a map keyed by `observerKey(id, version)` from the deployment contracts. Each registered `DeploymentObserver` exposes its exact ID/version, `validate(configuration)` and read-only `observe(request, signal)`. Missing/incompatible observers or invalid configuration block dispatch before any external effect. This registry supplies trusted code; enrollment and remote content cannot import code or extend permissions. Observer validation must check configuration without changing target state.

The [observation request](../schemas/target-observation-request.schema.json) carries only version, a fresh observation ID, configured target/environment and frozen observer configuration. It deliberately supplies no expected source SHA or receipt outputs. An observer must read the actual target and return the matching observation ID, target/environment, stable resource ID, application repository identity, deployed source SHA (or null), health and observation timestamp using the [target observation schema](../schemas/target-observation.schema.json). Forwarding runner outputs is not an independent read. Use read-only target access, separate from workflow deployment credentials, and keep secret values out of configuration and observations.

The [local JSON reference observer](../packages/workflow-broker/local-observer.ts) reads a separate loopback HTTP service with bounded responses, no redirects and an abort signal. It only accepts an operator-configured `http://127.0.0.1` endpoint without credentials/query/fragment. This is a controlled local reference, not an HTTP fallback for production. Production transports, authentication and deployment-provider adapters require separate enrollment and qualification; the installed CLI does not load observer modules from payloads or installation paths.

## Execution

Obtain a broker claim, retrieve validated inputs, prepare/build the exact source, apply the repository's deployment procedure, verify target health/revision and submit a receipt. The coordinator also confirms the bound workflow conclusion. Serialize changes to each environment and reject a stale request before its effect.

For the implemented exact-source profile, the coordinator independently reads the exact GitHub run attempt and compares the immutable receipt's operation/digest, source, target, claim/fence and executor bindings. Only an agreeing terminal receipt/run can proceed to target verification. A successful receipt and GitHub conclusion must also agree with a fresh healthy target observation of the exact application repository/SHA. Runner-reported health or `deploymentVerified` output is never sufficient.

Observation timeout defaults to 15 seconds and maximum observation age to 30 seconds; profiles may configure the schema-bounded limits. Future timestamps, wrong target/environment/repository/correlation, wrong or absent revisions, unknown health, malformed data and unavailable observers preserve `outcome_unknown`. An identity-valid explicit unhealthy result records failure. An agreeing failed/cancelled workflow records deployment failure without fabricating a target read. Failed health is retained even if the process dies before finalization and a later target read becomes healthy.

Migration 15 adds immutable content-addressed [deployment evidence](../schemas/deployment-evidence.schema.json) without changing earlier migrations or creating historical evidence. A deployment begins with the original dispatch identity. Evidence includes the receipt digest, claim, frozen enrollment/recipe binding, exact GitHub attempt, target sample, coordinator timestamp, recovery epoch, verdict and blocker. Staging evidence alone cannot verify a deployment or release its target lock.

Finalization revalidates bindings, current conflicts/holds, recovery epoch and successful-sample freshness inside the transaction that records operation completion, deployment state and target-lock release. A crash during that transaction leaves all completion changes uncommitted. Failure retains the active dispatch and a persistent recovery hold; uncertainty retains the active dispatch. Existing continuous reconciliation retries reads only and never repeats dispatch, effect permission or deployment.

Application source can contain executable build code. The owner is approving that release's source and its CI/provenance. Secrets should exist only in the job/step that needs them, and production privileges must not be available to arbitrary PR execution.

## Failure and recovery

Mark a known failed pre-effect action failed. If a target may have changed, reconcile actual release state before another deployment. Automatic rollback requires a separately implemented, authorized and qualified recovery executor. This slice executes no rollback and exposes no generic rerun or hold-clearing endpoint. Later recovery is an explicit, separately authorized action; a recovered target does not rewrite the failed deployment as verified.

Database migrations need a declared strategy: compatible migration, restore from backup or forward fix. Never claim that switching an application symlink undoes database changes.

The frozen recovery policy records supported methods, operator steps, migration strategy/limits and rollback qualification. Diagnostics show `rollbackQualified` only when rollback is supported and listed, migration compatibility is declared, and trusted qualification evidence is bound to the exact recipe digest, target and environment. A boolean alone, mismatched qualification or irreversible migration cannot qualify rollback. Qualification references are operator-enrolled evidence declarations, not independently executed tests or permission to act.

`labstride runs` includes deployment state, latest evidence/blocker, cleanup blocker and full recovery limits through the existing workflow diagnostics. Failed/unknown operations cannot advance successful workflow steps. These blockers do not implement W05 deletion or establish cleanup eligibility by themselves: keep, active sessions, ownership and dirty/unpushed work remain additional gates. Unknown workspaces must be retained.

There is no down migration. Recover a compatible stopped-service backup and reconcile the original workflow/target before resuming effects; restoring SQLite cannot undo external delivery or migrations. Restoration invalidates old observation epochs; it does not grant permission to reuse historical success. Installed restore/recovery and full AC16 remain open. Stale-release ordering remains LS-DEP-005 / #27.

## Examples

[Laravel recipe](../examples/laravel-recipe.md) demonstrates a release-directory application. It is illustrative and has not been deployed. The first owner's cloud pilot is documented separately and uses the same generic operation contract.
