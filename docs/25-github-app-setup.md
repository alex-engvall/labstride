# 25 — Dedicated GitHub App setup

This is a candidate setup for **W00.1 / LS-GH-001**, not evidence that a dedicated App has been created or its permissions verified. Keep App identity, installation ID, repository IDs, Project IDs and credential references in installation-local configuration. The public runtime is not implemented yet.

## Initial repository capability profile

Start with the permissions required for synthetic issue/branch/file/PR tests and CI observation. Add further capabilities only when their test or action is ready.

| Repository permission | Initial grant | Intended API operations |
| --- | --- | --- |
| Metadata | Read, automatically required | Resolve repository identity |
| Issues | Read and write | Create/update/close owned synthetic test issues; later project progress comments |
| Pull requests | Read and write | Create/update/close a synthetic PR; inspect review facts |
| Contents | Read and write | Read files; create a test ref and ordinary fixture file; later policy-authorized merge |
| Checks | Read | Observe actual check runs; never manufacture successful checks |
| Commit statuses | Read | Observe commit status contexts |
| Actions | Read | Read workflows, runs and jobs |

These grants are the initial candidate for these operations, not a mathematically proven minimum for every GitHub endpoint. Contents write and PR write are intentionally broader than an observation-only client: they support the specified workspace/PR behavior. Existing repository protections still apply.

All other repository, organization and account permissions remain **No access**. In particular, do not grant Administration, Secrets, Workflows, repository Projects or organization Projects for this personal-Project pilot. Leave all protection-bypass settings unchanged.

Actions **write** is a separate later grant for an explicitly chosen synthetic dispatch workflow. The initial read grant cannot dispatch, cancel or rerun workflows. Editing workflow definitions is another distinct capability; prepare the fixture workflow through the repository owner's normal contribution process rather than granting Workflows write by default. A successful App write must still be correlated with an independently observed downstream CI run before the token/event criterion passes.

The [file/PR/CI probe](evidence/W00.1-app-file-pr-ci-2026-10-21.md) verified that this App profile created/updated a synthetic file and opened/updated/closed a PR, automatically triggering three successful PR workflows while Actions stayed read-only. No merge or deployment was performed. Treat that as evidence for the tested App/repository/event combination, not for workflow dispatch or every installation.

## Register and install

The connected GitHub tools can operate on repositories but do not expose App registration, private-key generation or an authenticated settings browser. An owner must complete those settings steps. GitHub supports a prefilled registration URL; this only prepares the form and does not create or install anything.

Generate a link with installation-specific, non-secret inputs:

```bash
python3 - <<'PY'
from urllib.parse import urlencode

settings = {
    'name': 'YOUR-UNIQUE-LABSTRIDE-APP-NAME',
    'description': 'Labstride repository capability pilot',
    'url': 'https://github.com/alex-engvall/labstride',
    'public': 'false',
    'webhook_active': 'false',
    'request_oauth_on_install': 'false',
    'issues': 'write',
    'pull_requests': 'write',
    'contents': 'write',
    'checks': 'read',
    'statuses': 'read',
    'actions': 'read',
}
print('https://github.com/settings/apps/new?' + urlencode(settings))
PY
```

1. Open the generated link while signed into the intended owner account. Review the actual form; URL preselection is not verification of saved settings. Choose a globally unique App name (at most 34 characters).
2. Set **Where can this GitHub App be installed?** to **Only on this account**. The App is private even though Labstride's source repository is public.
3. Leave callback/setup URLs empty, user authorization during installation unchecked and device flow disabled. This initial App uses installation authentication, not a personal OAuth login. Keep the default expiration setting for any future user tokens.
4. Keep the webhook **Active** checkbox unchecked. There is no verified webhook receiver yet; the personal-Project pilot starts with bounded outbound polling. Do not enter a placeholder webhook URL.
5. Verify the permission table above and select **Create GitHub App**. Record the non-secret App ID and App slug from its settings. Do not create a client secret for installation authentication.
6. Select **Install App**, choose the owner account and select **Only select repositories**. Choose exactly the operator-approved test repositories, then install. Do not select all repositories or modify the existing general-purpose GitHub connector installation.
7. Record the non-secret installation ID from the settings URL. Generate one private key from the App's **Private keys** section. Store the downloaded PEM outside source checkouts, with a restricted directory/file mode (typically `0700`/`0600`) or an approved secret store. Do not put it in Git, issue comments, chat, generated reports or shell arguments.

The private key signs the App JWT; that JWT requests short-lived installation tokens. Neither the private key nor resulting tokens should be copied into an agent-writable checkout. Provision the key for the trusted operator/coordinator identity. Runtime identity separation remains a separate implementation gate.

## Personal Project credentials are separate

Repository selection does not grant or limit access to a personal Project. Do not add repository Projects or organization Projects permissions on the assumption that either covers it. First probe the chosen personal Project with the actual dedicated App identity and report the observed support or rejection.

If that identity cannot provide the required personal-Project operations, separately configure a dedicated, expiring user credential with the smallest supported grant. GitHub documents classic `read:project` for queries and `project` for queries/mutations. A project-only classic token is a candidate for public test items, not an already verified replacement for App repository access. Do not add `repo`, `workflow`, `gist` or organization scopes as a silent fallback.

The [Project-only PAT probe](evidence/W00.1-project-pat-2026-10-21.md) verified this setup for new drafts and a public issue-backed single-select field. Retain scope and expiry checks, an owner-only credential file and an installation-local reference. A dotenv-backed credential must be loaded as the selected named literal without shell execution or exporting unrelated entries. These probe results do not establish private-item support or reliable last-field-editor attribution.

The later [actor/observation probe](evidence/W00.1-actor-observation-2026-10-21.md) verified that the Project PAT can also read actor-bearing built-in Status/membership events for the public issue fixture. The App's current grants returned no Project timeline events even though the PAT returned nine, without a GraphQL error. Use the validated Project credential for this observation path; do not infer human approval from `wasAutomated=false`, or general field/draft history from Status support. No additional scope was needed for that verified subset.

The classic `project` scope covers accessible user/organization Projects; it does **not** provide a provider-enforced allowlist for one Project number. Constrain the configured target in the adapter and report that this is an application boundary. If single-Project isolation is mandatory, treat the broader grant as unsupported until an acceptable credential/identity arrangement has evidence. Private issue-backed items may require additional repository visibility and must be tested separately.

## Verification after owner setup

1. Authenticate using the new App's JWT and inspect the App's declared permissions. Discover the installation and verify its owner, `repository_selection=selected`, exact repository ID set and effective grants. Never infer these from the owner's normal `gh` login.
2. Mint installation tokens with explicit `repository_ids` and only the permissions needed by the particular probe. Enumerate accessible installation repositories and inspect the returned grants/expiry. Successful reads of public third-party repositories do not prove or disprove selected-repository isolation.
3. Run reads, then synthetic issue/ref/file/PR mutations using the App identity; read back actual state and retain fixture identities. No source changes, merge, deployment or live third-party API call is requested by this setup guide itself. Avoid existing workflow triggers until their behavior has been reviewed.
4. Independently test personal-Project reads/writes, observation and field-change actor attribution with the selected Project credential. The authenticated viewer is not evidence of the field-change actor.
5. When a safe workflow fixture exists, grant Actions write if required, obtain a fresh token and verify dispatch/downstream CI against the exact source revision. This does not grant Workflows write or protection bypass.
6. On a lost mutation response, reconcile the fixture before further action. Cleanup targets only newly created test resources. Revocation is available by suspending/uninstalling the dedicated App and revoking the dedicated key; do not remove other integrations or assume remote effects were undone.

Record commands, API/client versions, token capability metadata, readback, cleanup and unsupported combinations in the [evidence index](evidence/README.md) and its probe reports. Discovery #11 is completed for the recorded installation, with evidence merged in PR #39. LS-GH-001 remains `in_progress` for cross-package acceptance; the setup guide does not implement Doctor or pass AC29. Continue durable recovery in W01, adapter capability enforcement in W02 and operator diagnostics/recovery in W06.

## Primary references

- [Prefilling the registration form](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-using-url-parameters)
- [Registering an App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)
- [Choosing permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
- [Endpoint-specific grants](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)
- [Private-key management](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps)
- [Narrowing installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
- [Project API authentication](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects)
- [User token scope boundaries](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
