# 24 — Pull request templates

Use one template per PR and keep the result focused on the problem, changed behavior and evidence. Write public PR descriptions in English. Replace prompts with actual results; use N/A with a short reason when a section does not apply.

| Template | When to use it | Main review information |
| --- | --- | --- |
| [Default implementation](../.github/pull_request_template.md) | Implementation, features and general improvements | Outcome, issue/LS/AC links, changes, verification, compatibility and recovery |
| [Bug fix](../.github/PULL_REQUEST_TEMPLATE/bug_fix.md) | A regression or incorrect behavior | Reproduction, established cause, fix, regression evidence and existing-operation recovery |
| [Connector or action](../.github/PULL_REQUEST_TEMPLATE/extension.md) | Connectors, actions, providers, session providers and recipes | Contract, capabilities, configuration, permissions, resource ownership and conformance evidence |
| [Documentation](../.github/PULL_REQUEST_TEMPLATE/documentation.md) | Guides, specifications, examples and contribution templates | Reader outcome, sources, consistency and documentation validation |

## Choose a template in GitHub

The default template is stored at `.github/pull_request_template.md` and fills a new PR body automatically in GitHub's normal creation flow. Specialized templates live under `.github/PULL_REQUEST_TEMPLATE/` and are selected with the `template` query parameter.

For example, replace `YOUR_BRANCH` with your branch in this URL before opening it:

```text
https://github.com/alex-engvall/labstride/compare/main...YOUR_BRANCH?quick_pull=1&template=bug_fix.md
```

Choose `extension.md` or `documentation.md` instead for those changes. Add the parameter before writing the PR description; changing templates may replace an existing draft body. These are Markdown PR templates, not issue forms with required form fields.

## API and agent-created PRs

When creating a PR through an API or integration that supplies the body explicitly, read the appropriate template and provide the completed Markdown yourself. Do not assume GitHub inserts a template into an API-supplied body. Keep stable requirement and acceptance IDs and follow the [agent guide](AGENT-GUIDE.md).

## Tracking and evidence

Use `Related to #...` for partial work and `Closes #...` only when the PR meets the issue's full acceptance criteria. A work-package tracker usually spans several implementation PRs. Keep [issue mappings](issue-index.json), the normative specification and requirement evidence consistent; closing an issue does not by itself verify a requirement.

Only report checks that were actually run. Record untested environments, recovery limits and illustrative examples explicitly. Template checkboxes are contribution reminders, not automated checks or authorization to merge/deploy. DCO sign-off follows [CONTRIBUTING](../CONTRIBUTING.md) and must use the real contributor's identity.

## GitHub references

- [Creating PR templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository)
- [Selecting a template with a query parameter](https://docs.github.com/en/pull-requests/reference/using-query-parameters-to-create-a-pull-request)
