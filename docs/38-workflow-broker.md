# 38 — Authenticated repository workflow execution

W04.1 implements an opt-in workflow action, loopback broker and durable reconciliation. [Local evidence](evidence/W04.1-workflow-broker-2026-10-24.md) is distinct from live GitHub runner, HTTPS ingress, installation-credential and target acceptance. This slice records authenticated workflow completion; W04.2 / #25 owns verified deployment health/revision and recipe recovery.

## Enrollment and composition

Package `packages/action-github-workflow` using the existing extension packager. Pin the resulting `labstride.github-workflow` version `1.0.0` artifact, integrity, `workflow.dispatch.v1` capability and `network.github` permission. Packaging creates an artifact for review; it installs or enables nothing.

The action's configuration contains an `enrollments` map. Each versioned [enrollment](../schemas/workflow-enrollment.schema.json) declares the workflow repository name, numeric repository/owner IDs and GraphQL node ID; workflow ID/path; allowed branch/tag ref and pinned workflow SHA; target ID; environment; named Actions credential reference; and bounded recipe inputs. Workflow refs cannot be PR refs. The initial profile supports direct GitHub-hosted `workflow_dispatch` jobs, with the enrolled GitHub environment claim. Reusable and self-hosted workflow identities are denied pending qualification.

A configured step supplies `target`, `enrollment` and `source` using the [action input](../schemas/workflow-input.schema.json). The source is an exact application repository/node identity and SHA. Bindings and recipe inputs are frozen by the operation's configuration digest and dispatch record. Changing the active configuration does not rebind existing operations. Recipe input strings are data, never commands or secret values.

The operational installation optionally adds `brokerListener: { "port": 8787 }`, alongside its existing enabled HTTPS `configuration.broker.url` and `oidcAudience`. The listener always binds `127.0.0.1`; a separately managed TLS ingress forwards to it. The public URL must be credential-free HTTPS. Enabling a workflow step without listener settings fails installation validation. Existing broker-disabled installations need no changes and open no listener. Do not enable execution until the operator has qualified the actual runner-to-broker route and dedicated credential. This change does not provision ingress or expand an App's permissions.

The trusted embedding API also accepts `startExecution(..., { workflowBroker: { host, provider, port }, ... })`. Await `ready` before reporting availability. Runtime shutdown closes the listener and drains workers before closing the database. `labstride runs` exposes workflow/source revisions, original executor, consumed permission, receipt conclusion and conflicts without tokens or credential values.

Use a dedicated selected-repository GitHub App credential for Actions writes/reads and required contents reads. The provider resolves the workflow ref and application commit independently and checks numeric/node repository mappings. Deployment-provider credentials remain in the selected workflow's protected delivery step; the coordinator only resolves its Actions credential reference. No deployment-provider credential belongs in operation inputs, a source checkout, coding environment, agent prompt or hook.

## Protocol and effect boundary

Only the three bounded workflow inputs `operation_id`, `request_digest`, `schema_version` cross dispatch. No issue body, shell string, arbitrary URL or credential is dispatched. The [reference client and workflow](../tools/workflow-runner/workflow.example.yml) obtain the authoritative request from the broker. The run name is exactly `labstride:<operation-id>:<request-digest>` for discovery. Its presence alone grants no permission.

All broker methods are POST with JSON and bearer OIDC authentication:

| Endpoint | Input and result |
| --- | --- |
| `/v1/operations/{id}/claim` | Version and request digest; returns the original operation, enrollment and authenticated claim |
| `/v1/operations/{id}/authorize-effect` | Version, request digest and claim ID; grants a one-time effect permission |
| `/v1/operations/{id}/receipt` | Existing versioned workflow receipt; acknowledges immutable bound evidence |

Bodies are limited to 256 KiB, tokens to 16 KiB and headers to 24 KiB. Unknown fields/versions, malformed JSON, encoded bodies and unsupported methods/paths fail before claims. Responses and errors follow the [versioned broker reply](../schemas/workflow-broker-reply.schema.json). Safe errors distinguish invalid requests, denied identity/policy, competing claims, consumed permissions, conflicting receipts and unavailable providers. Tokens and rejected payloads are never persisted or logged.

The verifier uses GitHub's fixed issuer and JWKS endpoint. It verifies RS256 signatures, exact audience, validity and token age, repository/owner, workflow path/ref/SHA, workflow-trigger SHA, event, environment, run and attempt. It independently reads the attempt-specific GitHub run endpoint, including workflow ID, repository numeric/node identities, head repository, revision, event, discovery marker and creation window. Claim/effect requests require an in-progress run; receipts also allow a completed run with a still-valid token. A forged body cannot replace verified identity. Provider/JWKS outages grant no permission.

The coordinator's original claim and effect boundary authorize dispatch. A separate atomic workflow claim binds one run/attempt and inherits the target fencing number. Identical claims return the original claim; other executors receive `409`. Neither a rerun nor a lease expiry replaces it.

The runner prepares the exact application SHA, checks its checkout, and calls `authorize-effect` immediately before invoking its repository-owned effect module. The broker atomically rechecks bound policy, current restrictions, pause/cancel/human/budget/restore holds, deadline, request generation and target binding, then consumes permission once. A repeated request receives `409`, including after a lost authorization reply or coordinator restart. Consuming permission is a point of no automatic replay, not proof that the effect happened. Restrictions committed afterward cannot undo an external effect.

The runner imports the delivery module only after authorization. A repository-owned `delivery.mjs` exports `effect({ operation, enrollment, claim })` and returns `{ conclusion, resources, outputs, error? }`. Use `error` with the receipt schema's safe code/message/retry class for failure or uncertainty. The reference workflow deliberately has no deployment implementation or embedded credentials. Build/test application code in a separate job/runner without production secrets, so it cannot modify the trusted delivery code before secrets become available. Bind transferred artifacts to the exact source and immutable content digest. Supply a required deployment secret only to the reviewed delivery step, which must not execute application build hooks with that credential. Workflow code and recipes remain trusted installed code, not a sandbox.

The client saves the exact receipt in a new runner-temporary file before posting it. Its `report` command can resend that receipt with renewed OIDC authentication; it never repeats authorization or delivery. Preserve this record for operator recovery. A missing record, expired authentication or failed effect without independent target evidence remains uncertain.

## Reconciliation and recovery

Migration 14 appends dispatch, executor-claim and receipt tables; migrations 1–13 remain unchanged. Existing operations gain no invented workflow run or claim. Workflow advancement uses a target/environment resource key, independent of workspace and workflow repository, and dispatch state retains a second active target lock. Conflicting evidence places a persistent target hold. No timer releases uncertain locks.

The provider supports both an empty `204` dispatch acknowledgement and a `200` acknowledgement with a run ID. Intent is committed before the single POST. If its response is lost, later ticks discover matching candidates and independently read the bound attempt. Missing, duplicate, contradictory, truncated or unavailable evidence remains `outcome_unknown`. Run-list pagination is bounded; reaching its limit or observing inconsistent pages is not evidence of absence.

The reviewed workflow adapter declares continuous reconciliation: uncertain outcomes and observation outages are deferred at bounded intervals instead of exhausting the ordinary transient-read retry budget. This capability authorizes reads only. It never calls `start` again, clears consumed permissions or releases unknown resources. Definite pre-effect validation failures retain the existing bounded retry/manual-recovery behavior.

Receipts must match operation/digest, claim/fence, application SHA, target and authenticated executor. Identical receipts are idempotent; conflicting receipts return `409`, retain the original evidence and hold the target for reconciliation. Observation, receipt ingestion and audit continue after an action revocation. Hooks cannot submit authenticated receipts or manufacture a claim/approval.

A workflow operation succeeds only after its authenticated receipt and independently observed exact run attempt agree on terminal conclusion. Missing receipt, green run alone, wrong attempt or conflicting conclusion cannot complete it. The action returns workflow receipt evidence with `deploymentVerified: false`; it creates no verified deployment. Health/revision checks, stale-release/predecessor ordering, rollback and delivery-specific cancellation remain #25 and their owning packages.

There is no down migration or unknown-operation rerun endpoint. Preserve active/unknown records and workspaces. Rollback requires a compatible stopped-service backup and reconciliation against the original provider/target; restoring SQLite cannot undo a dispatch or deployment.

## Dependency and acceptance limits

Existing pinned `jose` 6.2.13 moves from development to runtime dependencies for broker JWT/JWKS verification. It is MIT licensed; retain its notices. It avoids implementing signature verification in application code. Its existing lock/integrity is retained, and upgrades require re-running signature, claim and outage tests. Clean distribution, supported installation profiles and dependency notices remain W07 qualification.

Local tests cover LS-DEP-001/002/004 and the workflow boundary of LS-SEC-002. Full AC10/11/12/23/34 require the promised live environment. W04.2 / #25 owns target verification in AC11 and release evidence; W01.4 / #17, W02.3 / #20 and W06 own the remaining session/projection/installed integration in AC35. Hooks-disabled broker execution is covered locally; the complete AC35 scenario remains `not_run`. No local fixture or green unrelated CI closes those gates.

API semantics are based on the [GitHub workflow dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event), [attempt-specific run API](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run-attempt) and [OIDC reference](https://docs.github.com/en/actions/reference/security/oidc), reviewed 2026-10-24. Runtime acceptance still needs actual execution evidence.
