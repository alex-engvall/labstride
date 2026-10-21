# 26 — Contract fixtures and toolchain

This W00.3 / [#13](https://github.com/alex-engvall/labstride/issues/13) slice implements executable public contract fixtures and schema-derived TypeScript declarations. It does not provide a coordinator, installed extension loader, provider adapter or session bridge. The application runtime remains unimplemented. See the [implementation evidence](evidence/W00.3-contract-fixtures-2026-10-21.md) and earlier [environment discovery](evidence/W00.3-toolchain-session-discovery-2026-10-21.md).

## Request and result envelopes

[Requests](../schemas/contract-request.schema.json) and [results](../schemas/contract-result.schema.json) discriminate family and method, with shared definitions in [contract-common](../schemas/contract-common.schema.json). All 24 method pairs have typed core inputs/results and executable fixtures:

| Family | Methods |
| --- | --- |
| Provider | capabilities, readSnapshot, subscribe, reconcile, project |
| Connector | probe, execute, upload, download, inspect, cancel |
| Action | describe, validate, start, observe, cancel, reconcile |
| Session provider | capabilities, start, resume, observe, send, interrupt, close |

Each envelope carries `schemaVersion`, `requestId`, `extensionId`, `protocol`, `family` and `method`. A response has `outcome=ok`, a method-specific result and null error, or an explicit error/unknown outcome with null result and a structured error. `ok` means the method returned a result; an action result can still be accepted, failed, cancelled or uncertain. Progress is not completion. An unknown outcome requires `retryClass=reconcile`; its error code cannot appear under an ordinary `outcome=error` or a definite direct-operation status. The fixtures never replay an external effect.

The fixture checks request/response correlation and selected nested provider/action/session identities. Production dispatch must additionally bind the negotiated profile, pinned extension, installation, operation/request generation, handle ownership and current policy. Provider-specific field values and action/session inputs remain explicit extension-owned object slots requiring the selected pinned input schema and semantic validation. A structurally valid envelope does not grant permission.

Direct connector/action results carry their own handle, resources, outputs, evidence and error; they have no workflow executor field. [Workflow receipts](../schemas/receipt.schema.json) remain a separate contract for independently verified GitHub Actions identity. Transfer paths have relative-path syntax checks; W03 must still verify enrollment, target ownership, links and filesystem boundaries before effects.

Examples include one [request](../examples/contract-request.json), [result](../examples/contract-result.json) and [all four families](../examples/contract-families.json). Schema versions, extension protocol versions and package versions remain independent.

## Version, capability and integrity fixture

The [synthetic loader](../tools/conformance/load-artifact.mjs) accepts a bounded single-module fixture artifact: JSON containing exactly `schemaVersion`, `manifest` and `module`. The trusted caller separately pins ID, package version, family and SHA-256 of the entire artifact's exact bytes. The hash covers the manifest and module together; the same verified in-memory bytes supply the import, avoiding a path reread between verification and use.

Before importing the synthetic module, the fixture checks the host profile, digest, manifest schema, pinned identity, supported major, required host capabilities, required extension capabilities and configured permission subset. Host versions must be integers with a positive major and minor in `0..65535`; capability and permission lists must contain nonempty strings. Missing or malformed host data rejects loading before module evaluation. Minor negotiation selects the smaller supported minor. Advertised extension capabilities unknown to the host are ignored when optional; a missing required capability rejects loading. No manifest grants itself a permission.

The fixture then imports only the reviewed synthetic module used by the tests. It is not a general package resolver, sandbox or production loader. It does not download packages, verify arbitrary package dependency graphs, enforce operating-system permissions or install an extension. W01/W07 must carry those boundaries into actual runtime loading and packaging. AC22's production loading guarantee remains `not_run`; the before-import tests provide its bounded fixture evidence.

## Advisory hook observation and acknowledgement

[Hook observations](../schemas/hook-observation.schema.json) carry provider/run/request-generation/workspace/session/turn identity, event ID, bounded lifecycle kind, source version, timestamp and evidence references. Raw provider hook JSON is not accepted. The core envelope permits no prompt/transcript/tool-argument payload or approval/completion grant. The origin is always `extension`; an observation is never an instruction to start work.

The normalization boundary requires a separately reviewed provider-specific adapter to map supported raw events into this schema and correlate them with trusted enrollment. No Codex hook translator, hook definition or live endpoint is installed by this slice. An unavailable or unmapped event reports an unsupported capability; it does not invent an actor, turn or acknowledgement.

[Acknowledgements](../schemas/hook-ack.schema.json) distinguish accepted/duplicate observations with durable persistence and a stable observation ID from rejected/not-stored observations with an error. An accepted acknowledgement is not permission or operational completion. The [SQLite fixture](../tools/conformance/hook-store.mjs) checks enrollment identity, inserts the normalized observation and commits before returning success. Canonical key ordering deduplicates the same event; conflicting content under an existing event ID is rejected. After process death following commit but before reply delivery, reopening the disposable store returns duplicate with the original identity and one row. This is real fixture persistence, not a coordinator/outbox or live-hook recovery test.

W01 owns actual observation/outbox transactions and recovery; the session adapter owns normalization, actual backend facts and human/turn guards; W06 owns diagnostics and safe pause/unsupported outcomes. Missing atomic provider guards remain explicit. AC35/AC36 are unchanged and unrun.

## Reproducible tooling and formats

The tested tooling baseline is Linux x86_64, Node `24.22.0`, npm `11.19.1`, Python `3.13.5`. Node fixtures use built-in SQLite `3.53.4`; system/Python SQLite versions are separate. `package.json` constrains the Node 24 line and `package-lock.json` pins development package artifacts. This does not establish application support for every Node/Python/OS version. No public npm namespace is claimed: the fixture package is private.

Development-only dependencies:

| Dependency | Pinned version | License | Purpose / maintenance |
| --- | --- | --- | --- |
| json-schema-to-typescript | 16.0.0 | MIT | Generate declarations from local schemas; regenerate and review output on upgrades |
| TypeScript | 7.0.2 | Apache-2.0 | Check generated consumers and negative typing cases; compiler changes require revalidation |
| Ajv | 8.20.0 | MIT | Independently exercise Draft 2020-12 envelopes in Node; review schema/validator upgrades together |
| ajv-formats | 3.0.1 | MIT | Enforce declared formats in the Node fixture; keep aligned with Ajv |

The npm lock includes transitive licenses MIT, Apache-2.0, BSD-3-Clause, PSF-2.0 and Python-2.0. Retain upstream notices when redistributing tooling. These are development packages, not selected coordinator runtime dependencies.

[requirements-docs.txt](../requirements-docs.txt) now pins jsonschema `4.26.0`, attrs `26.1.0`, jsonschema-specifications `2025.9.1`, referencing `0.37.0`, rpds-py `2026.9.1`, rfc3339-validator `0.1.4`, rfc3986-validator `0.1.1` and six `1.17.0` (MIT). The two RFC validators are the minimal additional checkers for the formats used here. Dependency changes go through reviewed pins and a fresh environment check; a top-level version alone is not proof of format support.

[Schema validation](../scripts/schema_validation.py) discovers every declared format and fails if a checker is absent. It uses an explicit local schema registry with no remote retrieval. The documentation check rejects invalid timestamps in operation/receipt/event/hook payloads and invalid broker URIs. Structural acceptance of templates still does not verify repository permissions, HTTPS policy, target ownership, digests or enabled runtime settings. Vendor directories are excluded from repository documentation validation.

Run from a clean checkout, using a virtualenv outside the repository:

```bash
python3 -m venv /tmp/labstride-contract-docs
/tmp/labstride-contract-docs/bin/python -m pip install -r requirements-docs.txt
npm ci --ignore-scripts --no-audit --no-fund
npm run check:types
npm test
/tmp/labstride-contract-docs/bin/python -m unittest discover -s tests -p 'test_*.py'
/tmp/labstride-contract-docs/bin/python scripts/validate_docs.py
```

Use a fresh, operator-owned temporary directory if the example location already exists. To change a schema, run `npm run generate:types`. [The generator](../scripts/generate_types.mjs) snapshots and checks the entire local schema inventory before compilation. Its resolver reads only that snapshot, with default filesystem and HTTP retrieval disabled. It checks every generated file for drift with `--check`. Linked schema/output files, linked schema/output directories, non-file output entries and unexpected output-directory entries are preserved and reported before any output is written. This is a development tool for an operator-controlled checkout, not protection against another process concurrently replacing filesystem paths. Eleven generated files cover the existing seven schema roots and four new envelope roots. Common definitions are resolved into their consumers. Generated TypeScript does not encode every JSON Schema condition, format, pattern or bound, including the error/status consistency rules; runtime validation remains required.

The [type consumer](../tests/types/contracts.ts) checks discriminated fields and expected compiler rejection of a shell field, forged workflow executor and approval hook. The 53 Node tests cover [45 contract cases](../tests/contracts.test.mjs) and [eight generator cases](../tests/generate-types.test.mjs), including drift and preservation of unmanaged paths. The [four Python tests](../tests/test_schema_validation.py) independently cover real timestamp/URI formats, missing checker rejection, local-registry boundaries and uncertainty consistency. Their synthetic code, disposable stores and single Node test process share no live provider login. The sole killed child belongs to the persistence fixture; no existing user session or service is stopped.

Primary tool references: [generator](https://github.com/bcherny/json-schema-to-typescript), [Ajv Draft 2020-12](https://ajv.js.org/json-schema.html), [jsonschema format dependencies](https://python-jsonschema.readthedocs.io/en/v4.26.0/validate/#validating-formats). These describe the tools; local executions in the evidence record establish the tested behavior.
