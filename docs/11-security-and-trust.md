# 11 — Security and trust boundaries

## Assets and boundaries

Protect deployment credentials, source code, workspace content, agent credentials, configuration authority and operation history. Untrusted inputs include public issues/comments, issue forms, PR source, dependencies and remote command output.

| Threat | Required boundary |
| --- | --- |
| Public issue requests privileged work | Resolve actor/repo permission before creating a run; pilot operator allowlist |
| Field contains shell/code/package URL | Typed rule bindings; fixed installed capabilities; no eval/interpolation |
| PR modifies deploy policy/workflow | Pinned trusted policy/workflow revision; reviewed changes before privilege expansion |
| Workflow fabricates success for another run | OIDC identity, operation claim, digest and independent run/target observation |
| SSH endpoint substituted | Enrolled host key; reject mismatch and require explicit key rotation |
| Cleanup points outside workspace root | Target registry, owned marker, safe path resolution and deletion lock |
| Agent reads deployment credentials | Separate identities, files and environments; no secrets in agent prompt |
| Malicious installed extension | Reviewed pinned artifact and least privilege; installed code is trusted, not sandboxed |
| Crash causes repeated effect | Durable intent, claim, fencing where possible and unknown-outcome reconciliation |
| Hook reports forged completion or approval | Enrolled session correlation, bounded observation contract and independent policy/provider checks |

## Identities

Separate coordinator identity, GitHub repository/project credentials, workflow identity, SSH workspace user and privileged target operations. The agent user must not be able to edit coordinator policy, host-key trust or the authoritative ownership registry.

An operator-approved rule grants bounded operations, not a generic terminal with production secrets. Autonomous merge/deploy can be enabled without handing the coding session the credential that enforces policy. A revocation is checked again before each privileged effect.

Hooks execute within their provider's trust boundary and are not a complete enforcement or audit boundary. Agent-writable scripts cannot hold the coordinator's privileged Project/deployment credentials or become the authority for merge, approval, cleanup ownership or task completion. Use the trusted projection path and reject stale/foreign session observations. Keep agent authentication with its enrolled provider identity; do not distribute personal login caches to CI runners. Do not execute untrusted contributor code on a persistent runner carrying the agent's or deployment operator's credentials.

## Data minimization

Store IDs, revisions, hashes, safe status and evidence references in the coordinator. Session transcripts remain with their session provider by default. Do not mirror whole issues, source files, prompts or secret values into audit logs. Logs may contain sensitive repo names/paths; document their access and retention.

Default metadata retention is 90 days as an adjustable design choice. Never expire active, unknown or retained-resource records. Purge only resolved terminal records according to policy, preserving the evidence needed for still-live resources.

## Host access

Secrets are enrolled outside version control through the operator's approved secret store/file permissions or GitHub environment secrets. The SSH connector enforces host identity and a configured user/root boundary. No broad passwordless root shell is part of the default design. Exceptional privileged provisioning belongs to an explicit reviewed recipe.

## Scope of isolation

Separate directories/branches prevent accidental work overlap. They do not sandbox malicious code running under the same OS account. Use separate OS users or stronger isolation when workloads or contributors are untrusted. The pilot runs operator-approved work on a trusted host; stronger tenancy is outside the MVP.

## Release gates

Verify a private reporting route, license/provenance checks, secret scanning and boundary tests before public release. A threat-model checklist does not replace the specified executable failure/recovery tests.
