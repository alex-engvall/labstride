# 39 — Current-revision direct merge

## Opt-in boundary

W04.3 implements `labstride.github-merge` version `1.0.0` for LS-GH-006/007. The operator selected a separate action and a first profile restricted to strictly protected direct merges. These accepted choices do not enable an installation. The [local evidence](evidence/W04.3-merge-gate-2026-10-24.md) is separate from live GitHub qualification and full AC13/AC14 acceptance.

The trusted embedding API supplies `startExecution(..., { githubMerge: { host, provider }, ... })`. The installed runtime additionally requires `mergeEnabled: true`; absence or false leaves the action unavailable. An installation must separately enroll its pinned artifact, workflow step and authorization grant. Packaging includes the artifact without enabling it. The issue-to-review profile and native coding report have no merge grant or merge-request field.

An authorized request uses the existing operation scheduling boundary with [merge input](../schemas/merge-input.schema.json): protocol version, enrollment key, target, source repository/revision, PR number and expected head. Source SHA equals expected head. Repository names and IDs, target, branch, method, credentials and required evidence come from the run's frozen [enrollment](../schemas/merge-enrollment.schema.json), never from issue text or a request's policy assertions. The embedding caller schedules with `mergeResource(enrollment)`, which identifies the repository and target branch; the effect boundary rejects claims with another resource key. Ordered workflow steps select this key automatically. Agent adapters may request this action only through an already authorized scheduling integration; no public generic merge endpoint is added.

The merge credential must be a configured GitHub App installation binding with contents write and the enrolled repository in its token scope. Raw token-file credentials do not establish this capability. Protection reads may use a separate explicitly configured credential. Secret values never enter operation inputs, evidence or logs. The provider accepts a trusted HTTPS API base for compatible GitHub hosts; the packaged installed profile uses public GitHub. Endpoint and permission compatibility on other hosts is unverified.

## Gate and provenance

Before submission, independently read the repository and PR identities, current base ref, head/base ancestry, classic branch protection and every applicable active ruleset, with bounded response sizes, pagination and request timeouts. Missing pages, ambiguous data, permission failures and unreadable protection fail closed. A 404 is not proof of an unprotected branch.

The first profile requires readable classic protection with strict required checks, enforcement for administrators, and no force pushes or branch deletion. Configured checks must be platform-required. Merge credentials must not be permitted to bypass applicable review/ruleset protections. Unknown rules, merge queues, unsupported bypass identities and ruleset-only protection are blocked. GitHub retains final enforcement of reviews, signatures, conversations and other active requirements; the coordinator never creates approval evidence or changes protections.

Combine configured and platform-required check contexts and App identities. Require actual successful completed check runs on the exact head or validated current synthetic test-merge SHA. When a context exists on the synthetic merge, evaluate that context there. Inspect both head and synthetic-merge statuses: a legacy commit status cannot establish an App identity, so a required context with such a status remains blocked even if green. Ambiguous duplicate checks, missing or mismatched App IDs, pending, failed, cancelled, neutral and skipped results do not pass. This initial profile deliberately supports a narrower set than GitHub's general merge capabilities.

Required repository-owned workflows have enrolled IDs, paths, App IDs and Git blob SHAs for their workflow files. A blob SHA pins file contents rather than an unrelated application commit. Verify the file on both current head and base; reject changed workflow definitions. Read the exact current run attempt, successful conclusion, check suite and current PR/head/base association. Missing or stale associations cannot be inferred from a matching head alone. Synthetic test-merge parents must identify the current base and head. Its SHA is never recorded as the actual merge result.

Optional jobs do not become required solely by sharing a suite with a required check. Required workflow runs must still finish successfully.

Read head, base ref and protections again, and verify attempts remain current. The action collects two complete gate snapshots and requires their evidence to agree. New heads, bases, protections, checks or attempts invalidate earlier evidence. Immediately before intent creation, the coordinator rechecks pinned configuration, current policy and restrictions, automation controls, deadline, request generation, branch claim and recovery holds.

## Merge and recovery

SQLite migration 16 adds durable merge intents and a unique active repository/branch lock. It does not invent evidence for existing operations. A one-time intent is persisted before the direct `PUT /repos/{owner}/{repo}/pulls/{number}/merge` request. The request contains the expected head and enrolled merge method. No alternate push, branch update, protection edit, queue submission or bypass operation exists.

GitHub's direct API protects the expected head but has no expected-base parameter. Branch serialization covers this coordinator; independent base-ref refresh and platform-enforced strict up-to-date checks cover external concurrent base changes. A newly granted bypass permission or protection change after the final read cannot be atomically compared by this API. Live qualification must verify the selected credential and actual protection behavior; local fixtures cannot establish that boundary. See [GitHub's merge API](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request) and [effective branch rules](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch).

Only an acknowledged successful merge and matching independent PR readback, including expected source head, repository, branch, merge SHA and merging actor, establish confirmed operation success. Record the actual SHA in [merge evidence/intent](../schemas/merge-record.schema.json), action outputs and the durable execution audit. A recognized direct-merge rejection (405, 409 or 422) finishes as failed and never retries the same intent. Other uncertain failures retain the intent.

After a lost response, crash or uncertain result, retain the original intent and reconcile through reads only. An open PR, empty read or unrelated green check does not authorize resubmission. A visible merge without matching acknowledgement is recorded as `observed_external`, with its actual SHA, while operation attribution remains uncertain. Conflicting readback also stays uncertain. Active intents and claims retain the branch hold. An already confirmed record can complete the original operation after restart without another mutation. Reads may continue during revoked policy; new effects cannot. A changed recovery epoch rejects in-flight gate/readback evidence.

There is no generic rerun, lock-clearing endpoint or down migration. Preserve unresolved records and use separately authorized investigation/recovery. Restoring SQLite does not undo a GitHub merge; restore a compatible stopped-service backup and reconcile external state before authorizing further effects. Older binaries reject the newer database version.

## Downstream qualification and open gates

Enrollment names an existing owned qualification PR, its actual merge SHA and downstream workflow run, bound to the selected App/installation, repository, actor, target branch and workflow blob. Independently observe merged PR provenance plus a successful `push` run and check suite from the expected App. The gate revalidates that proof and persists its [typed report](../schemas/merge-qualification.schema.json) with gate evidence. Missing or incompatible proof blocks submission. An API write or a general statement about tokens is not evidence that downstream workflows ran.

A read-only report can be produced from a protected installation specification and pinned enrollment:

```sh
node scripts/qualify_merge.ts /absolute/path/to/installation.json selected
```

This command reads existing provider facts; it cannot create qualification fixtures, merge a PR, edit configuration or enable a service. A separate operator-authorized live exercise must establish the initial proof. Provider token behavior differs by credential/event combination; consult [GitHub's token documentation](https://docs.github.com/en/actions/concepts/security/github_token) and retain actual run URLs and identities.

No live merge, credential-grant change, protection change or downstream push workflow was executed for this implementation. AC13/AC14 remain `not_run` at the full/live scenario level. Issue #26 remains incomplete until the dedicated credential, real protection inventory, stale-head/absent-check scenarios and downstream trigger are exercised in an authorized owned repository. W04.1/2 retain runner/deployment gates; W05 owns cleanup and W06 owns installed operational recovery. Existing AC35/AC36 evidence and status are unchanged.
