# 09 — GitHub and workflow execution

## Adapter

Use a GitHub App with selected repositories for repository operations where supported. Discover the exact permissions needed for issues, PRs, checks/statuses, Actions and contents. Project access is a separate capability: verify the owner type and credential support, including personal Projects. If the chosen App cannot access the personal Project, use an explicitly configured minimal supported user credential for that adapter only, or report unsupported. Do not request all-repository scope as a silent fallback.

Signed webhooks reduce latency. Reconciliation is mandatory for missed/unsupported events and restart recovery; a pilot using personal Projects may use polling as the authoritative observation path. Default polling target is 60 seconds, adjustable for API budgets. Use pagination, cursors, backoff and current-state reads.

Authenticate webhook signatures before parsing effects. Record delivery IDs, reject oversized payloads and accept replayed deliveries without repeating effects. A valid signature proves delivery, not that an issue author may start a job.

## Merge gate

Use configured required checks and the platform's active protections. Check each required result for the current PR head and relevant base/merge context. Missing, pending, cancelled and failed results do not count as success. An empty check set does not silently mean green; explicit no-check policy is a separate choice.

An agent may request merge when policy grants it. The executor rechecks policy and current head immediately before merging, binds the expected head to the provider operation where supported and records the resulting merge SHA. Do not bypass protection or manufacture a human review. A target repo's DCO/CLA and other checks still apply.

## Workflow request

The action maps an operation to a repository-owned workflow. Record workflow repository ID, path/ID, allowed ref and resolved workflow SHA separately from application source SHA. A workflow on an untrusted PR branch must not acquire deployment credentials.

Dispatch inputs are bounded structured strings containing operation ID, request digest and protocol version. The workflow obtains the authoritative execution request from the coordinator after authentication. A run name may carry the operation ID for discovery but is not authentication.

## Authenticated claim protocol — adopted design

The pilot uses a small HTTPS execution broker on the coordinator. The runner obtains GitHub OIDC identity with the configured audience. The broker verifies signature, issuer, audience, validity and allowed repository/workflow/ref identity, plus run ID/attempt. It compares them with the pending operation and retrieves independent GitHub run metadata as needed. This is an application design using GitHub identity, not an existing Labstride service.

POST /v1/operations/{id}/claim atomically grants the first compatible executor a claim with its immutable request digest and fencing number. A duplicate claim by the same executor returns the existing claim. A different executor gets 409 while an effect may be active. An expired heartbeat never alone grants another executor permission to repeat.

The workflow then validates target/source/inputs, executes only the permitted operation, and posts a result to /v1/operations/{id}/receipt. Repeat identical receipts are accepted idempotently; conflicting receipts return 409 and trigger reconciliation. Authentication never trusts request body run identity instead of verified token/run identity.

Preflight must establish a secure route from GitHub runner to broker. No insecure HTTP fallback, open agent API or generic remote shell endpoint. W00 must verify this route before workflow execution is enabled.

## Receipt and completion

The receipt binds operation ID, attempt, input digest, source SHA, target, executor run ID/attempt, conclusion and resource observations. The coordinator verifies workflow identity and actual conclusion through GitHub. Success for deploy also requires the configured target health/revision evidence. A green workflow alone is insufficient where the health requirement exists.

Download artifacts only for the bound trusted run, with size/path limits and no execution. Artifact content is evidence after validation, not a command channel. Logs/artifacts contain secret-free operation metadata.

## Reconciliation and retries

If dispatch acknowledgement is lost, find the matching run and claim. Multiple matches are a conflict; unclaimed duplicates must fail before effects. If the system cannot prove what ran, retain outcome_unknown. Do not offer a generic rerun button for uncertain mutations.

GitHub workflow concurrency complements coordinator locks but does not replace operation identity or establish exactly-once execution. A manually rerun job still goes through the claim gate.

Official references are in 17-sources.md. API/claim coverage must be checked against the actual GitHub version and permission model during W00.
