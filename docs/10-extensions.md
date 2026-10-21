# 10 — Extension contracts

## Contract families

| Kind | Contract |
| --- | --- |
| Provider | capabilities, readSnapshot, subscribe/reconcile, project |
| Connector | probe, execute, upload/download where supported, inspect, cancel |
| Action | describe, validate, start, observe, cancel, reconcile |
| Session provider | capabilities, start/resume, observe, send, interrupt, close |

Capabilities are versioned identifiers, not inferred from package names. A connector must report unsupported operations explicitly. Optional methods are absent unless advertised.

## Manifest and packaging

A manifest declares ID, package version, protocol major/minor, kind, entrypoint, capabilities, input/output schemas, required host/target capabilities and permissions. The operator pins version and integrity in an installation lockfile. No download or update occurs because a remote issue contains a package name.

TypeScript types are generated from shared JSON schemas. In-process TypeScript extensions are first-class. The same protocol envelopes are suitable for a trusted child process over newline-delimited JSON; the first implementation need not provide language SDKs beyond TypeScript. Full process isolation/sandboxing is not claimed.

Public built-ins are independently testable packages using the same contracts. External and private packages must pass the same contract suite; no core branch may identify the owner's private extension by name.

## Operation API

validate(request) returns normalized input or typed validation errors without effects. start(request) receives a persisted operation ID and returns accepted/terminal/unknown with an opaque handle. observe(handle) retrieves current facts. cancel(handle) reports requested, unsupported or observed completion. reconcile(request, handle) locates an effect after interrupted communication without creating another one.

The request contains schema version, operation/run/workspace IDs, action ID/version, source repository and SHA where relevant, target ID, input digest, deadline and validated inputs. It contains secret references only; credential resolution belongs to the relevant executor boundary.

The result declares conclusion, evidence, resources and a structured error if present. Progress events are advisory; they cannot alone mark an operation complete. A connector disconnect after sending a command is outcome_unknown unless the remote registry proves the result.

## Error vocabulary

validation_failed, forbidden, unsupported_capability, authentication_failed, identity_mismatch, stale_revision, policy_changed, resource_busy, rate_limited, transient_unavailable, configuration_invalid, projection_conflict, operation_failed, cancelled, outcome_unknown.

Errors contain a stable code, safe message, evidence ID and retry classification. Only known pre-effect transient failures may be retried automatically. Never classify an unknown effect as retryable just because an HTTP status was 5xx.

## Compatibility

Protocol major mismatch prevents loading. Minor additions must be optional and capability-negotiated. Breaking changes require migration guidance and paired contract fixtures. Extension versions and configuration snapshots stay pinned for an active run. Upgrades drain or pause work and preserve existing opaque handles.

## Required conformance cases

Input rejection without effects; unavailable target; lost start response; duplicate operation; cancellation during work; daemon restart; schema incompatibility; receipt mismatch; secret redaction; and independent execution without the owner's private extension.

A package may export multiple separately identified manifests, one per kind. For example, the workflow package exposes labstride.github-workflow.connector for target capability discovery and labstride.github-workflow as its action. The installation pins both identities to the same reviewed artifact. The receipt schema is specifically for workflow execution; direct SSH/helper results use the action contract and must not fabricate GitHub executor identity. W00 defines the remaining typed method/result envelopes before runtime implementation.
