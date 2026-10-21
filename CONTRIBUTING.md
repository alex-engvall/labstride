# Contributing

Start with an issue describing the user outcome, affected requirement IDs and proposed scope. Small fixes may go directly to a PR. New extension capabilities require a contract example, a failure case and a compatibility test.

Use the [issue chooser](https://github.com/alex-engvall/labstride/issues/new/choose) for implementation tasks, bugs, feature proposals, extensions and documentation. The [issue guide](docs/23-issues-and-contribution-forms.md) links the MVP roadmap and explains requirement tracking.

## Developer Certificate of Origin

Contributions use Apache-2.0 and the unmodified [Developer Certificate of Origin 1.1](DCO). Sign off each contribution you are entitled to submit, using git commit -s. A sign-off is an attestation about provenance and permission, not a transfer of copyright.

Use your actual contributor identity. For agent-assisted code, the submitting human remains responsible for understanding the change, its source and the right to contribute it. Do not invent another person's sign-off or treat model output as proof of provenance. No CLA is required for this project.

## Pull requests

Use the [default implementation template](.github/pull_request_template.md), or choose a [bug-fix, extension or documentation template](docs/24-pull-request-templates.md). The guide explains selection in GitHub and use by API/agent-created PRs.

Include problem, resulting behavior, LS/AC IDs, tests run, unverified limits and recovery implications. Required changes include the relevant contract, docs and backlog. New runtime dependencies need a purpose, license and maintenance rationale. Avoid implementation-mirroring tests.

Public connectors/actions live as separate packages in this repository initially. External authors may distribute separate compatible extensions. Installing an extension is an explicit operator action; publication is not an endorsement or security review.

Project installation commands will be documented after W00 establishes the toolchain. For this documentation foundation, install python3 -m pip install -r requirements-docs.txt, then run python3 scripts/validate_docs.py. After editing backlog.json, run python3 scripts/render_docs.py. These commands validate documentation only.

For the executable contract fixtures, use the Node 24 tooling baseline and a fresh Python virtualenv described in [the contract guide](docs/26-contract-fixtures-and-toolchain.md). Run `npm ci --ignore-scripts`, `npm run check:types` and `npm test`. Regenerate types after schema changes using `npm run generate:types`; generated declarations never replace runtime validation. Keep fixture evidence separate from live integrations and application acceptance.
