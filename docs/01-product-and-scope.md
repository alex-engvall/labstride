# 01 — Product and scope

Labstride coordinates long-lived development work from a configured request through a workspace, actions and observable results. Its value is continuity across tools and restarts, with user-owned workflows and replaceable extensions.

## First usable delivery

The public MVP must support a single-owner installation, GitHub as the main interface, a small CLI, one source repository per workspace, multiple independent workspaces, an SSH connector, user-defined GitHub deployment workflows and an extension that deletes completed workspace directories.

A separate private agent extension is developed alongside the public MVP to validate that the public contracts are sufficient. The public project must also work without any agent extension.

Deployment and workspace are different concepts. SSH can host a source checkout while the deployment workflow publishes to a different provider. Laravel is an illustrative recipe, never the core application model.

## Functional boundaries

| Component | Responsibility |
| --- | --- |
| Core | Runs, workspaces, operations, state, events, policy evaluation and recovery |
| Provider adapter | Read/write external issue fields, resolve identities and observe CI/PR facts |
| Connector | Reach a target and expose declared capabilities |
| Action | Perform one bounded operation and return a verifiable outcome |
| Workflow | Compose triggers, conditions, ordered actions and result mappings |
| Agent extension | Manage a coding session under declared permissions |

## First-release exclusions

No custom web dashboard, hosted SaaS, marketplace, automatic extension installation, multi-host coordinator cluster, cross-repository transaction, or universally verified OS support. Comment-driven agent interaction and additional agent providers are later increments. No build-system replacement.

The initial runtime is TypeScript/Node.js with SQLite. Linux runtime/SSH behavior must be tested before support is claimed. Provider-specific runtime setup belongs to recipes and actions. Future connectors may support different platforms.

## Definition of useful

One operator can configure their own fields, start an issue, continue work interactively, observe CI and merge/deploy outcomes, recover after a coordinator restart, and clean up a completed workspace without losing unsaved work. Another operator can replace the field names and deploy workflow without patching core code.
