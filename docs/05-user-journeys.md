# 05 — User journeys

## J01: Configure an installation

An operator installs a pinned coordinator release, creates a local persistent database, selects repositories and targets, authenticates the GitHub adapter and resolves field definitions. Preflight lists missing capabilities individually. No issue starts work until configuration is enabled and actor/field bindings resolve.

## J02: Start independent work

An authorized operator changes the configured request field. The adapter reads current facts; the coordinator evaluates a typed rule, snapshots inputs/configuration, deduplicates the transition and queues a run. An action creates the workspace on the selected target. A repeated webhook cannot create another workspace.

## J03: Continue interactively

An installed agent extension attaches one persistent session to the workspace. A human can open that same session. If plan mode is selected, implementation waits for explicit approval of the current plan revision. Human turns take precedence over scheduled automated continuation.

## J04: Deliver

Changes are pushed to the assigned branch and presented as a PR. Configured checks must pass for its current revision. An authorized decision-maker may merge within configured policy. A repository-owned workflow deploys the resulting approved revision and provides a receipt. Merge, deploy and health are distinct facts.

## J05: Recover and stop

After a coordinator restart, pending intents are re-observed. The system adopts the existing workspace/session/workflow rather than creating duplicates. A pause prevents new actions; cancellation requests stop where supported and preserves uncertain outcomes for reconciliation.

## J06: Clean up

After the configured completion condition, a cleanup action checks ownership, keep, active users/processes and unsaved/unpushed changes. It removes only the assigned directory and returns a receipt. Other runtime resources need their own explicitly configured actions.

## J07: Extend

A contributor implements a declared capability, supplies a manifest, input/output schemas and contract fixtures, and releases a pinned package. An operator selects it explicitly. The core loads its compatible contract without knowing its provider or application framework.
