# 15 — Current decisions

The following accepted direction is stable. Keep history in ADRs and update the topic specification when an ADR changes behavior.

| ID | Decision | Status |
| --- | --- | --- |
| D01 | First user is the founder; prioritize a useful personal pilot | Accepted |
| D02 | Public foundation and a separate private agent extension ship together for the first owner-use delivery | Accepted |
| D03 | GitHub main interface with a small CLI, no MVP web dashboard | Accepted |
| D05 | Source workspace first; application runtime is optional and recipe-owned | Accepted |
| D07 | Existing SSH-reachable host, separate installation and owned directories | Accepted |
| D08 | Pilot starts from a configured field transition; field names/values remain replaceable | Accepted |
| D09 | Agent may decide merge and deployment within configured policy | Accepted |
| D10 | Plan mode requires human plan approval before implementation | Accepted |
| D11 | Concurrent issues use separate workspaces and branches | Accepted |
| D13 | One source repo per workspace initially | Accepted |
| D14 | Cleanup is an action; first contribution removes the owned directory | Accepted |
| D15 | Alexander Engvall is initial author/maintainer; owner GitHub handle alex-engvall | Accepted |
| D16 | Pilot cleanup follows verified completion, honors keep and preserves unsaved/unpushed work | Accepted |
| D17 | Commercial use and private extensions are permitted | Accepted |
| D18 | Public license is Apache-2.0 | Accepted |
| D19 | Contributions use DCO; contributor copyrights are retained | Accepted |
| D20 | Public documentation/code/contracts are English | Accepted |
| D22 | TypeScript/Node.js, SQLite, small coordinator and CLI; Linux verified first | Accepted |
| D23 | Labstride; public repository alex-engvall/labstride. Package namespaces remain unverified | Accepted |

Installation-specific decisions are kept with the installation. Missing D numbers here belong to the private owner's pilot details; numbering is not renumbered for publication.

## Adopted implementation design

ADR-001: one coordinator with a local durable SQLite store, transactional outbox and explicit unknown states.

ADR-002: versioned connector/action/session contracts; first-party and third-party extensions share the same loader and conformance suite.

ADR-003: GitHub workflow execution uses authenticated atomic operation claims and bound receipts; the pilot verifies OIDC and network reachability in W00.

ADR-004: GitHub fields are projections/requests with resolved IDs; observed operational state lives in the coordinator.

ADR-005: ownership-aware deletion remains in an action and target helper, with no generic deletion timer in core.

[ADR-006](adr/0006-hybrid-coordination.md): retain the durable hybrid, with GitHub owning tasks and human intent, repository-owned Actions handling CI/delivery, optional agent hooks reporting through one coordinator projection path, and an early interactive continuity/recovery proof. One small service and CLI ship together; personal Project polling, public-only use and installation independence remain required. This refines ADR-001 through ADR-005 without claiming implementation evidence.

These are technical design choices, not additional interview answers. Replace them only with an ADR stating evidence, compatibility and migration consequences.
