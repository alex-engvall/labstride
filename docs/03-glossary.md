# 03 — Glossary

| Term | Meaning |
| --- | --- |
| Installation | One coordinator, database and trusted configuration owned by an operator |
| Request | A desired unit of work from an authorized external actor |
| Run | One lifecycle execution for a request; has an immutable configuration snapshot |
| Workspace | An isolated source checkout, branch and optional runtime resources |
| Operation | A durable intent for one action; ID persists across observation/recovery |
| Attempt | A particular execution of an operation; a retry requires a reconciled outcome |
| Target | Configured connection/resource boundary, not an arbitrary hostname from an issue |
| Recipe | Repository-owned configuration for building/provisioning an application |
| Receipt | Validated result bound to operation, attempt, source revision and executor identity |
| Desired state | What an authorized actor requests |
| Observed state | Facts from the coordinator, GitHub, target or agent |
| Projection | A configurable representation of observed state in external fields |
| Keep | Operator hold preventing automated workspace cleanup |
| Unknown outcome | An effect may have happened; re-observe before any repeat |

An action in Labstride is a versioned extension operation. A GitHub Action is an execution/package mechanism on GitHub. The first deployment and cleanup extensions invoke repository-owned GitHub Actions workflows. Other extensions may use other execution mechanisms later.
