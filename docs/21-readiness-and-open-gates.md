# 21 — Readiness and open verification gates

The specification is sufficient to begin implementation. [W00.1 / issue #11](evidence/README.md) is completed discovery, with evidence merged in PR #39. The following are remaining implementation/discovery gates, not unanswered product questions:

| Gate | Owner/work package | Required evidence |
| --- | --- | --- |
| Runtime dependency versions | W00 | Supported Node/SQLite client/SSH/schema-validator versions and license inventory |
| GitHub adapter capability enforcement | W02 | Credential discovery is complete for the tested installation: [App repository access](evidence/W00.1-dedicated-app-2026-10-21.md), [PAT projections](evidence/W00.1-project-pat-2026-10-21.md), [App file/PR CI](evidence/W00.1-app-file-pr-ci-2026-10-21.md) and [PAT Status/membership actors](evidence/W00.1-actor-observation-2026-10-21.md). Implement live preflight and reject unsupported bindings; generic field/draft history and other containers have no verified support. |
| GitHub observation/recovery | W01/W02/W06 | [Disposable live cursor/crash/overlap probe](evidence/W00.1-actor-observation-2026-10-21.md) passed; actual coordinator state/outbox/authorization, continuous polling, provider retention, rate-limit/expiry recovery and Doctor remain unimplemented/unverified |
| Workflow claim identity | W00/W04 | Real OIDC claim/run identity match and rejection tests |
| Broker network route | W00/W04 | Authenticated TLS reachability from chosen runner without exposing agent endpoint |
| Real target ownership | W03 | Target helper unable to delete outside enrolled root |
| Session provider compatibility | External extension work | Existing interactive client can find/resume actual session with correct identity |
| Human/automation session ownership | W00/W01 + session extension | Same actual client backend, stale human/turn rejection and explicit limits where atomic guards are missing |
| Optional hook observation path | W00/W01/W02 + session extension | Versioned normalization, enrolled session correlation, missing/late/duplicate recovery and safe GitHub projection retries; working fallback without hooks |
| First integrated continuity proof | W01 then W02/W03 + session extension | One owned test issue/workspace/session survives duplicate start, connection loss, dropped hook, projection failure, coordinator restart and human takeover (AC35/AC36) |
| Required checks and protections | W04/pilot | Current repository check inventory and effective merge policy |
| Health/rollback semantics | W04/pilot | Exact deployed revision, functional health and failure handling |
| Release identity/reporting | W07 | Package namespace, reporting route and reproducible release metadata |

Installation-local values are deliberately unresolved: hostnames, keys, path roots, project/field/option IDs, credential references, workflow ref/SHA and cloud resource IDs. Templates use conspicuous placeholders and must fail live preflight until completed.

The [W00.1 evidence index](evidence/README.md) records completed discovery and assigns the remaining durable-state work to W01, GitHub adapter work to W02 and Doctor/operator recovery to W06. LS-GH-001 remains `in_progress` for cross-package acceptance coverage; AC02/AC05/AC29/AC35/AC36 remain `not_run`. Those runtime cases do not keep discovery #11 open.

Adopted technical design defaults may change through an ADR backed by evidence. The accepted product decisions must not be silently weakened to pass a gate. In particular, replacing the existing interactive client with a different experience is not an acceptable unnoticed compatibility workaround.

The [hybrid decision](adr/0006-hybrid-coordination.md) is accepted design, not evidence that these probes passed. Preserve the original full MVP criteria. Tool installation, successful login, Project reads or a documented hook event do not establish the integrated continuity guarantee.
