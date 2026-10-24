# W06 version command canary — 2026-10-24

Scope: issue #70, LS-OPS-001/W06 and bounded supporting evidence for AC29. This is command behavior evidence, not full operational or native issue-to-PR acceptance.

## Accepted direction and implementation

The operator explicitly approved the native Plan in this same session. The selected development behavior is successful JSON with `source: "development"` and `installedRevision: null`; no Git-derived revision substitutes for an installed revision.

The CLI handles `version` before importing operational dependencies or reading installation configuration. It reads only application-relative release metadata and the actual Node runtime version. The existing administrative installer verifies manifest and file hashes and protects installed release files. That boundary supplies release provenance; this command does not authenticate arbitrary manifests or revalidate the inventory. No installation/packaging behavior is changed.

Valid metadata yields the full packaged source revision. Missing metadata yields explicit development identity. Invalid metadata and unreadable metadata fail with stable JSON error codes, empty stdout and exit 1. Unexpected command arguments fail before operational initialization. Output has a versioned schema and generated TypeScript contract.

## Behavior verification

The focused subprocess tests reproduce an installed release layout in owned temporary directories, without Git, dependencies, installation configuration, credentials or a coordinator. Node's permission model denies all writes and child-process creation, and limits filesystem reads to the application root. It does not enforce network denial on Node 24. The version path uses only Node built-ins and never initializes network clients.

Checks cover the exact packaged revision, actual runtime version instead of manifest Node version, unrelated working directory with conflicting metadata, absent metadata, the actual development checkout, malformed/version-invalid/revision-invalid metadata, unreadable metadata, permission-denied reads and unsupported arguments. A separate schema check rejects inconsistent source/revision pairs. Operational CLI initialization is checked by creating a disabled template and refusing overwrite.

Executed on Linux with Node 24.22.0:

- `node --test --test-isolation=none tests/cli-version.test.mjs tests/installed-operations.test.mjs`: all 21 tests passed, including all eight version/CLI checks, with no skips.
- `npm test` against the final source: 546 tests, 538 passed, zero failures and eight explicit skips requiring an isolated root-operated OpenSSH server. Those SSH scenarios were not exercised in this checkout.
- `npm run check:types`: all 71 generated contracts matched and TypeScript passed.
- `python scripts/validate_docs.py` using the temporary environment with pinned `requirements-docs.txt`: 56 schema/example pairs, rejection cases, links and requirement/work-package/acceptance references passed.
- `python scripts/render_docs.py --check`: generated checklist matched the backlog.
- `python -m unittest discover -s tests -p 'test_*.py'` in that environment: all six tests passed.

The initial sandboxed subprocess test attempt failed with `EPERM`; approved execution outside that sandbox passed. The sandboxed operational test process was interrupted after it stalled; its complete approved rerun passed. The system Python environment lacked required format checkers; the pinned temporary virtual environment passed validation. These are execution-environment limitations, not successful checks or product acceptance evidence.

## Open gates and recovery

LS-OPS-001 and W06 remain `in_progress`; AC29 remains `not_run` because complete fresh-install capability diagnostics are outside this slice. Passing local tests does not establish native report consumption, coordinator publication, current-head remote CI, merge, deployment or installed-service qualification. The installed-layout fixture executes the actual command but does not run the administrative installer or upgrade the service.

The unknown run, workspace and session from #68 remain untouched. No delivery replay, credential/policy change, workflow change, service change or cleanup of existing workspaces is authorized or performed. This slice changes no persistent state or database schema; reverting it removes the command without changing active operations. Native publication remains independently observable by the coordinator.
