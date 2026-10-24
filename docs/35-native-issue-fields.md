# 35 — Native organization issue fields

The operator selected native organization issue fields for the permanent source repository and future issues. These are distinct from similarly named Project v2 fields. A Project membership is not required. This refines LS-GH-003/004/005 and LS-CFG-002/003; [live qualification](evidence/W03.2-native-fields-2026-10-24.md) distinguishes the selected installation from generic capability support.

## Binding and history

`GitHubIssueFieldsAdapter` is a trusted embedding API alongside the existing `GitHubAdapter`. Bind `organization_issue_field` with the repository's stable GraphQL ID as `scopeId`, the organization's field ID and exact option IDs. The adapter independently checks the repository allowlist, organization owner, field types/options and repository permission. Reads and writes use `github.credentialRef`; a Project credential is not substituted. The final issue preflight also requires `viewerCanSetFields`.

Text, number, date and single-select values are typed. Repository issue enumeration is bounded/paginated. Field definitions use bounded organization pagination; truncated issue values fail explicitly. Built-in title/body/state remain separate `native_issue` read bindings. Labels, form text, multi-select and arbitrary extension types are not added by this implementation.

Single-select starts require an independently enrolled actor-bearing added/changed/removed field event. Its qualification binds repository, issue, physical field, event, actor and option identity. The worker filters history by the physical request field before reconciliation. Events from AI settings or another field cannot establish a request transition. History contains option names, so ambiguous rename resolution remains blocked. Initial import is inert and duplicate/restarted observations retain the original generation. Native events do not establish that an authenticated User actor made a human gesture.

## Six-field installation profile

The versioned [profile](../schemas/github-issue-field-profile.schema.json) and [synthetic example](../examples/github-issue-field-profile.json) bind six logical roles. `issueFieldConfiguration` returns configuration fragments for ordinary compilation/activation; it neither activates a daemon nor grants policy authority.

| Role | Meaning |
| --- | --- |
| `request` | A positive `changedTo approved` requests a workspace. Managed progress maps preparing to provisioning and a registered ready workspace to ready. |
| `aiMode` | A configured choice of plan, implementation or no agent. It cannot grant a permission, skip plan approval required elsewhere or change policy. |
| `model`, `reasoning` | Configured option-ID-to-runtime-string mappings. The selected session provider must separately qualify the combination. |
| `path` | An output derived from the original committed checkout receipt/resource, target/root identity and protected installation root. |
| `session` | An output from exactly one attached registered session in the same run/workspace. |

`issueFieldSessionInputs` supplies typed field bindings with explicit mappings for later session/workflow composition. Unknown or unmapped options block materialization. There is no automatic model fallback or claim that every advertised GitHub choice is supported by a backend. The opt-in [local self-build profile](37-local-self-build.md) adds ordered advancement, continuous polling and startup-only defaults. Its separate session registration and checked-delivery capability do not change the conservative session provider.

Paths and session IDs edited in GitHub do not enroll resources, select commands or redirect an operation. `valueFrom` projection mappings accept either a registered workspace source path or registered session ID, never arbitrary issue text. Workspace output requires its successful original action, matching request/source/receipt, ready retained workspace and committed resource. The protected root mapping must be independently matched to the enrolled helper root during installation. Remote `localPath` remains null.

By default, human request/control fields cannot be projection targets, including aliases. The operator may set `allowManagedProgress: true` on a single-select request binding. All predicates on every alias must then be positive `changedTo` conditions with values disjoint from every managed output. Controls, negated predicates, other conditions and writes of a start value remain forbidden. A machine never writes Approved to request new work.

The same checked writer, frozen run snapshot, generation/policy checks, conflict holds and uncertain-attempt recovery apply to native fields. GitHub offers no field CAS or durable mutation receipt. Multiple fields use conservative issue-version fingerprints. The installed self-build profile serializes its own field writes and defers summary comments; an intervening manual/remote update can still require conflict review. This is not a promise of atomic multi-field progress or preservation of an unobservable concurrent human write. Old Project bindings, snapshots and static projection mappings remain compatible; this native adapter itself introduces no database migration. The separate installed workflow adds its own managed state migration.
