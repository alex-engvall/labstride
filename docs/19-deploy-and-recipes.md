# 19 — Deployment action and recipes

The generic deployment action invokes an operator-selected GitHub Actions workflow. It does not know Laravel, Cloudflare, systemd, a hosting panel, a database engine or a production directory.

Development runtime preparation is a separate [recipe-owned runtime action](36-recipe-owned-runtimes.md). Its database/service/URL resources do not attest a production deployment.

## Required recipe contract

Declare source repository, allowed source revision policy, workflow identity, target environment, inputs, build/artifact verification, health verification and rollback/recovery capability. Deployment output includes deployed revision or immutable artifact identity, target resource identifier, safe URL if appropriate and health result.

An application SHA and workflow SHA may differ; persist both. If an artifact is built earlier, bind its source SHA and content digest. A mutable tag alone is not deployment identity.

## Execution

Obtain a broker claim, retrieve validated inputs, prepare/build the exact source, apply the repository's deployment procedure, verify target health/revision and submit a receipt. The coordinator also confirms the bound workflow conclusion. Serialize changes to each environment and reject a stale request before its effect.

Application source can contain executable build code. The owner is approving that release's source and its CI/provenance. Secrets should exist only in the job/step that needs them, and production privileges must not be available to arbitrary PR execution.

## Failure and recovery

Mark a known failed pre-effect action failed. If a target may have changed, reconcile actual release state before another deployment. Automatic rollback is permitted only when the recipe advertises and has verified it; report failed health even if rollback succeeds.

Database migrations need a declared strategy: compatible migration, restore from backup or forward fix. Never claim that switching an application symlink undoes database changes.

## Examples

[Laravel recipe](../examples/laravel-recipe.md) demonstrates a release-directory application. It is illustrative and has not been deployed. The first owner's cloud pilot is documented separately and uses the same generic operation contract.
