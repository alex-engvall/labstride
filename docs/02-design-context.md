# 02 — Design context and existing systems

This is a new project. Existing private workspace automation was reviewed for lessons; its code is not part of this repository and has not been relicensed. Borrow the problem understanding and independently specified contracts, not private implementations.

The useful patterns are a durable resource inventory, continuation of an interactive session, exact-revision CI observation, separated execution identities and cautious cleanup. The costs to remove are hardcoded repository/field/model catalogs, control-panel provisioning assumptions, environment paths and multiple competing ways of driving an agent.

The documentation structure uses a product specification, repository audit, stable requirements, journeys, architecture, contracts, testing, work packages, decisions and evidence. Current normative behavior lives in the relevant topic document; change history belongs in ADRs and the changelog. Avoid successive contradictory notes at the top of a specification.

Source versions and private comparisons are kept in private owner planning material. Public technical references are listed in 17-sources.md. No existing private repository is required to build this project.

## Evidence limits

Repository reads establish what code/docs describe, not runtime correctness. No SSH connection, CI execution, live deploy or agent session was exercised while creating this archive. All backlog items begin planned. Existing systems' observed success does not automatically verify the new implementation.
