# 22 — API and schema reference

The JSON schemas are proposed normative v1 contracts for implementation. They are not evidence of a running API. Configuration/example identifiers are synthetic.

| Schema | Validated example | Consumer |
| --- | --- | --- |
| [config](../schemas/config.schema.json) | [installation template](../examples/installation.template.json) | CLI/coordinator |
| [extension](../schemas/extension.schema.json) | [manifest](../examples/extension.json) | Extension loader |
| [operation](../schemas/operation.schema.json) | [request](../examples/operation.json) | Action executor |
| [receipt](../schemas/receipt.schema.json) | [receipt](../examples/receipt.json) | Workflow adapter/broker |
| [event](../schemas/event.schema.json) | [event](../examples/event.json) | Provider adapter |
| [contract request](../schemas/contract-request.schema.json) | [four families](../examples/contract-families.json) | Extension dispatch |
| [contract result](../schemas/contract-result.schema.json) | [result](../examples/contract-result.json) | Extension caller |
| [hook observation](../schemas/hook-observation.schema.json) | [observation](../examples/hook-observation.json) | Enrolled adapter/coordinator |
| [hook acknowledgement](../schemas/hook-ack.schema.json) | [acknowledgement](../examples/hook-ack.json) | Durable observation boundary |

## Validation layers

The [W00.3 clean-environment probe](evidence/W00.3-toolchain-session-discovery-2026-10-21.md) found missing optional date-time/uri checkers. The [fixture implementation](26-contract-fixtures-and-toolchain.md) fixes this through pinned dependencies, checker-availability failure and invalid-format rejection. Validation uses a local-only registry; it does not fetch schemas from payload URLs. Generated TypeScript does not replace runtime format/pattern/conditional validation.

Schema validation is followed by semantic validation: repository/target/field references exist; option values resolve; action input/output schemas match; claims agree with observed provider identity; paths belong to the workspace; and the current policy permits the effect. A schema-valid template is not an enabled or authorized installation.

Extension-specific configuration and action inputs are validated by the selected pinned extension schema. Generic object slots do not grant arbitrary permission.

## Binding notation

In configuration inputs, context.source, context.mergeSha and context.workspaceId are reserved typed binding tokens, not string-evaluated expressions. Other strings are literals. The compiler rejects unknown context tokens or incompatible types. Field values in rules/projections use logical option keys resolved to external option IDs.

## Digest

requestDigest is SHA-256 of the canonical operation JSON with requestDigest omitted. Use RFC 8785 JSON canonicalization in the implementation and reject unsupported/non-finite values. It covers action/version, configuration digest, source, target, deadline and all inputs. Samples contain only strings/integers/objects; their canonical form is checked by the archive validator. Executor identity and claim are added after dispatch and do not change the request.

## Broker endpoints

| Endpoint | Authentication | Behavior |
| --- | --- | --- |
| POST /v1/operations/{id}/claim | Verified workflow OIDC | Atomic claim and authoritative request; 409 on competing executor |
| POST /v1/operations/{id}/heartbeat | Same workflow identity and claim | Liveness observation; never grants a new effect |
| POST /v1/operations/{id}/receipt | Same workflow identity and claim | Idempotent matching result; 409 on mismatch |
| GET /v1/operations/{id} | Operator or bound workflow | Authorized redacted current state |
| POST /v1/webhooks/github | Verified webhook signature | Persist event; no inline privileged execution |

Control endpoints are local and operator-authenticated in the MVP. Authorization failure is 403; invalid payload 400; missing authorized resource 404; conflicting revision/claim 409; temporary backend unavailable 503. A lost network reply is not evidence that a POST failed.

## Limits

Design defaults: 256 KiB broker bodies, 1 MiB webhook bodies, bounded provider pagination and sanitized error messages. Reject unsupported protocol majors. API version, extension protocol version and package version are independent.

## Session commands

[Session requests](../schemas/session-request.schema.json) and [observations](../schemas/session-observation.schema.json) define provider-neutral envelopes. See [request](../examples/session-request.json) and [observation](../examples/session-observation.json) examples. Provider-specific input/settings require the installed provider's schema.

A start operation returns/reconciles one session per operation ID. All later commands identify that session. A send must compare expectedLastTurnId and expectedHumanActivityRevision immediately before submission; mismatch is stale_revision. An observation can still race with human activity on the backend, so the provider must use supported atomic guards or pause/report the limitation rather than claim guaranteed race-free control.

Optional provider hooks must normalize through this enrolled boundary and the [hook observation/acknowledgement contracts](26-contract-fixtures-and-toolchain.md). They bind provider/run/request-generation/workspace/session/turn and distinguish committed acceptance, duplicate and rejection. The SQLite fixture verifies commit-before-ack and restart deduplication; raw-hook mapping, an enrolled endpoint and the actual outbox remain unimplemented. Accepted runtime events must enqueue one coordinator-owned projection path. Hooks cannot substitute for workflow receipts, human approval or authoritative session observations.

## Boolean operator controls

The controls map binds keep and pause to configured logical values of supported external fields. For example, a single-select field can express retain/release. Values must be disjoint and resolvable. Unknown/missing keep values block cleanup; unknown/missing pause state prevents new automated effects until reconciled. Operators may also set an explicit local hold through the authenticated CLI; an external release value cannot silently remove a local hold.
