# 09 — GitHub and workflow execution

## Adapter

Use a GitHub App with selected repositories for repository operations where supported. Discover the exact permissions needed for issues, PRs, checks/statuses, Actions and contents. Project access is a separate capability: verify the owner type and credential support, including personal Projects. If the chosen App cannot access the personal Project, use an explicitly configured minimal supported user credential for that adapter only, or report unsupported. Do not request all-repository scope as a silent fallback.

Capability discovery must identify the tested credential boundary: an operator's broad CLI credential or connected-tool access does not verify the dedicated installation App, selected-repository isolation or minimal Project permissions. Record reads and writes separately, including fixture readback and cleanup. Tool endpoint restrictions must be distinguished from GitHub permission failures. The [initial broad-credential report](evidence/W00.1-github-access-2026-10-21.md) is partial historical evidence; the [W00.1 closeout and handoff](evidence/README.md) records completed discovery #11 after the dedicated-credential probes. Runtime enforcement and integrated acceptance remain with W01/W02/W06; completion of discovery does not pass AC29 or the continuity cases.

The [dedicated App setup guide](25-github-app-setup.md) defines an initial candidate profile with Actions read access; dispatch requires a separately justified Actions write grant. Keep installation repository selection and per-operation token grants explicit. A fallback classic `project` user scope is broader than a single personal Project; a configured Project allowlist must not be described as provider-enforced isolation.

The [dedicated App probe](evidence/W00.1-dedicated-app-2026-10-21.md) established selected-repository reads and synthetic issue writes. Public personal-Project reads succeeded but draft creation was rejected with the App's current complete grants. The separately configured [Project-only user PAT](evidence/W00.1-project-pat-2026-10-21.md) passed read/set/clear/remove tests on a new draft and a public issue-backed Project item without repository scopes. The [App file/PR probe](evidence/W00.1-app-file-pr-ci-2026-10-21.md) verified file create/update, PR create/update/close and automatic downstream PR CI with all three configured workflows passing at the recorded source/base context. The [actor/observation probe](evidence/W00.1-actor-observation-2026-10-21.md) established a credential-specific issue-backed Status/membership history path and disposable checkpoint recovery; arbitrary-field history and actual coordinator recovery remain unverified. These standalone probes do not enable a runtime installation.

The inspected Project item and single-select value types expose creator and timestamp metadata, not a separate last-editor field. Preserve this distinction in capability reports: authenticated viewer, item/value creator and last change actor are different facts. Current-state polling must not treat creator metadata as authorization for a later field change. Credential references remain installation-local; load only the configured named literal when using a dotenv source and never execute the credential file as shell code.

For supported issue/PR-backed Project bindings, discover actor-bearing membership and built-in Status events through the issue/PR timeline using the configured Project credential. Do not infer general field/draft history from that capability. The tested App returned an empty timeline while the Project PAT returned actual events; validate the chosen credential's capabilities instead of treating an error-free empty result as proof of no changes. Bind events to Project/content identity, stable actor ID, current binding revision and request generation. Event status strings do not supply immutable option IDs or membership generation.

Neither a User actor nor `wasAutomated=false` proves a human gesture or approval: the probes observed that flag on both scripted PAT writes and bot-originated Project automation. Apply trusted operator policy and preserve unknown/redacted actors. Do not authorize start, plan approval or privileged execution from that flag alone.

Signed webhooks reduce latency. Reconciliation is mandatory for missed/unsupported events and restart recovery; a pilot using personal Projects may use polling as the authoritative observation path. Default polling target is 60 seconds, adjustable for API budgets. Use pagination, cursors, backoff and current-state reads.

Start the personal-Project pilot with bounded outbound polling. GitHub documents Projects v2 item webhooks for organization-level projects; do not assume a Project field change is a repository Actions trigger. Verify event availability and actor attribution for each selected credential/container. Scheduled Actions can be delayed/dropped and are not the only observation/recovery loop. See [primary sources](17-sources.md).

Persist normalized observations, deduplication IDs and cursor advancement atomically in the coordinator. Resume with overlap where supported and reconcile against current state. The live probe recovered Status history after missed reads, but same-second events appeared opposite the recorded write order and an intermediate Priority change left no event in the tested timeline. Do not replay a history list as executable instructions or assume a timestamp provides total causal ordering. Handle invalid cursors/partial GraphQL errors without advancing an unverified checkpoint; a full observation rescan must not discard durable operation identities or start historical requests. Treat `totalCount` as metadata, not proof of a complete or unchanged item set.

The coordinator alone projects managed technical progress to GitHub after normalization and validation. Optional agent hooks report into that path; CI/workflow facts are independently refreshed from GitHub. Keep a failed projection in the durable outbox, coalesce superseded progress safely and preserve human edits, approvals and newer request generations. A turn-end hook is not a release-completion receipt.

Authenticate webhook signatures before parsing effects. Record delivery IDs, reject oversized payloads and accept replayed deliveries without repeating effects. A valid signature proves delivery, not that an issue author may start a job. W02.2 implements the [enrolled actor-verifier and bounded-policy admission boundary](31-authorization-and-policy.md). A denied matching event has a durable authorization decision and no executable graph. W02.3 supplies [credential-specific observation, bootstrap/generation persistence, signed webhook ingestion and checked projection recovery](32-github-reconciliation.md); normalized event fields and audit actor IDs alone remain insufficient. Its [evidence](evidence/W02.3-reconciliation-2026-10-23.md) includes real GitHub writes, response loss, renames and visible conflicts, while full SSH/session continuity remains with AC35/AC36.

Current Project state can become visible before its actor-bearing timeline event. Preserve the previous accepted field baseline and unconsumed history while waiting; do not advance past the request or invent an actor. A later complete, unambiguous provider observation can then recover the same current request. The GitHub writer explicitly declares checked pre-read/write/readback capability. No field CAS or durable applied-token identity is inferred from `clientMutationId` or a matching value.

## Merge gate

Use configured required checks and the platform's active protections. Check each required result for the current PR head and relevant base/merge context. Missing, pending, cancelled and failed results do not count as success. An empty check set does not silently mean green; explicit no-check policy is a separate choice.

An agent may request merge when policy grants it. The executor rechecks policy and current head immediately before merging, binds the expected head to the provider operation where supported and records the resulting merge SHA. Do not bypass protection or manufacture a human review. A target repo's DCO/CLA and other checks still apply.

## Workflow request

The action maps an operation to a repository-owned workflow. Record workflow repository ID, path/ID, allowed ref and resolved workflow SHA separately from application source SHA. A workflow on an untrusted PR branch must not acquire deployment credentials.

Reuse Actions for builds, tests, packaging and delivery rather than reproducing those systems in the coordinator. Workflow execution is bounded; persistent agent sessions and workspace ownership stay with their enrolled host/provider. The Actions job token is repository-scoped and temporary. W00 must separately verify Project credentials and whether the chosen token/event combination starts the expected downstream CI; a successful API write does not prove a new workflow will run. Do not copy a personal agent login into Actions as a convenience fallback.

The observed App-originated PR event triggered CI while the App retained Actions read-only. This does not establish dispatch permission or the behavior of another credential/event combination. Bind observed runs and checks to actor, workflow identity, run attempt, PR head and base context; distinguish a PR's synthetic test-merge commit from an actual merge into the target branch.

Persist validated run-to-PR/base associations with their observation provenance. In the [later read-only review](evidence/W00.1-app-file-pr-ci-2026-10-21.md), all three run APIs returned empty PR lists despite their original associations being recorded. Reconcile missing/conflicting context against durable receipts and independent provider facts; do not infer it from a matching head alone. Historical success never replaces the current-context checks in the merge gate.

Dispatch inputs are bounded structured strings containing operation ID, request digest and protocol version. The workflow obtains the authoritative execution request from the coordinator after authentication. A run name may carry the operation ID for discovery but is not authentication.

## Authenticated claim protocol — adopted design

The pilot uses a small HTTPS execution broker on the coordinator. The runner obtains GitHub OIDC identity with the configured audience. The broker verifies signature, issuer, audience, validity and allowed repository/workflow/ref identity, plus run ID/attempt. It compares them with the pending operation and retrieves independent GitHub run metadata as needed. This is an application design using GitHub identity, not an existing Labstride service.

POST /v1/operations/{id}/claim atomically grants the first compatible executor a claim with its immutable request digest and fencing number. A duplicate claim by the same executor returns the existing claim. A different executor gets 409 while an effect may be active. An expired heartbeat never alone grants another executor permission to repeat.

The workflow then validates target/source/inputs, executes only the permitted operation, and posts a result to /v1/operations/{id}/receipt. Repeat identical receipts are accepted idempotently; conflicting receipts return 409 and trigger reconciliation. Authentication never trusts request body run identity instead of verified token/run identity.

Preflight must establish a secure route from GitHub runner to broker. No insecure HTTP fallback, open agent API or generic remote shell endpoint. W00 must verify this route before workflow execution is enabled.

The [isolated W00.2 probe](27-oidc-discovery-probe.md) implements a narrower push-only, single-run/attempt identity test at `/v1/discovery/oidc-probe`. The [completed live discovery](evidence/W00.2-live-oidc-2026-10-21.md) verifies genuine signatures/claim bindings, independent attempt metadata, runner HTTPS, negative profiles and renewal after expiry in two real attempts. Its local fixtures alone are not that evidence. Health only means HTTP process availability. Keep private policy/read credentials and separately authorized HTTPS ingress outside public source. The temporary probe was stopped/token-revoked and has no operation claim/effect endpoint; production claims, receipts and authorization remain W04 implementation work.

## Receipt and completion

The receipt binds operation ID, attempt, input digest, source SHA, target, executor run ID/attempt, conclusion and resource observations. The coordinator verifies workflow identity and actual conclusion through GitHub. Success for deploy also requires the configured target health/revision evidence. A green workflow alone is insufficient where the health requirement exists.

Download artifacts only for the bound trusted run, with size/path limits and no execution. Artifact content is evidence after validation, not a command channel. Logs/artifacts contain secret-free operation metadata.

## Reconciliation and retries

If dispatch acknowledgement is lost, find the matching run and claim. Multiple matches are a conflict; unclaimed duplicates must fail before effects. If the system cannot prove what ran, retain outcome_unknown. Do not offer a generic rerun button for uncertain mutations.

GitHub workflow concurrency complements coordinator locks but does not replace operation identity or establish exactly-once execution. A manually rerun job still goes through the claim gate.

Official references are in 17-sources.md. API/claim coverage must be checked against the actual GitHub version and permission model during W00.

Native organization issue fields use the separate [repository-scoped binding and history contract](35-native-issue-fields.md). The selected permanent source profile does not depend on similarly named Project fields or a disposable verification Project.
