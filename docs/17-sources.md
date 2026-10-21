# 17 — Sources and evidence

Reviewed 2026-10-21 (Swedish date). These are evidence sources, not instructions overriding the operator's policy. APIs are version-sensitive; verify exact deployed capabilities in W00.

| Source | Use in this design |
| --- | --- |
| https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-fields-in-your-organization | Distinguish organization issue fields from Project fields |
| https://docs.github.com/en/rest/issues/issue-field-values | Read/write issue-field values; preserve unrelated values |
| https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects | Resolve project/item/field/option identities and update projections |
| https://docs.github.com/en/graphql/reference/projects | Distinguish current-state creators from actor-bearing issue/PR Status and membership history |
| https://docs.github.com/en/webhooks/types-of-webhooks | Webhooks attach to supported resources, not individual user accounts |
| https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows | Event/dispatch behavior; do not assume every webhook starts an Actions workflow |
| https://docs.github.com/en/actions/reference/security/oidc | Workflow identity for the proposed execution-claim broker |
| https://docs.github.com/en/webhooks/webhook-events-and-payloads#projects_v2_item | Projects v2 item webhook availability is organization-level; verify personal Project observation separately |
| https://docs.github.com/en/actions/concepts/security/github_token | Repository-scoped job credentials and token-dependent downstream workflow triggers |
| https://docs.github.com/en/actions/concepts/runners/github-hosted-runners | Job runner lifecycle versus persistent workspace/session ownership |
| https://docs.github.com/en/actions/concepts/security/compromised-runners | Separate untrusted source execution from persistent privileged credentials |
| https://learn.chatgpt.com/docs/hooks | Optional lifecycle observations, trust review, interrupted background delivery and incomplete enforcement coverage |
| https://learn.chatgpt.com/docs/app-server | Session lifecycle and active-turn steering; read-only backend discovery is recorded separately from unverified session adoption and atomic effects |
| https://learn.chatgpt.com/docs/non-interactive-mode | Saved Codex authentication and programmatic execution; not proof of shared interactive session ownership |
| https://www.apache.org/licenses/LICENSE-2.0 | Public license and contribution terms |
| https://www.apache.org/foundation/license-faq.html | Commercial/private use and distribution interpretation |
| https://developercertificate.org/ | Unmodified DCO 1.1 |

## Evidence standards

Repository inspection is source evidence only. Live tests need a source SHA, environment, exact operation, observed result and known limits. Keep public evidence synthetic and redact sensitive identifiers. Never label an unexecuted acceptance case passed.

The execution broker, field compiler, extension protocol and lifecycle design are Labstride design choices. Their existence and correctness are not established by the upstream sources.

[ADR-006](adr/0006-hybrid-coordination.md) records the adopted hybrid and its first proof. Scheduled-workflow delay/drop behavior is documented in the Actions event reference above. Do not generalize documentation support to a specific installed agent/client without versioned execution evidence.
