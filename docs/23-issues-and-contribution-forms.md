# 23 — Issues and contribution forms

[MVP roadmap #2](https://github.com/alex-engvall/labstride/issues/2) tracks eight work packages and 25 implementation slices covering all 52 initial requirements.

Work-package and task relationships are explicit links/checklists in issue bodies. Each task lists prerequisites, its user outcome, scope, acceptance criteria, relevant AC scenarios and specification references. These links do not claim native GitHub sub-issue or blocking relationships.

## Start and sequence

Begin with W00.1, W00.2 and W00.3. Complete the integration/toolchain gates before W01. W02 and W03 can proceed independently after W01. W04 requires both; W05 and W06 lead into W07. A work package is a coordination issue, not one large PR.

## Work-package trackers

| Package | Tracker | Prerequisites |
| --- | --- | --- |
| W00 — Resolve integration and toolchain gates | [#3](https://github.com/alex-engvall/labstride/issues/3) | None |
| W01 — Durable coordinator and operation model | [#4](https://github.com/alex-engvall/labstride/issues/4) | W00 |
| W02 — Configuration and GitHub request/projection adapter | [#5](https://github.com/alex-engvall/labstride/issues/5) | W01 |
| W03 — SSH and independent workspace action | [#6](https://github.com/alex-engvall/labstride/issues/6) | W01 |
| W04 — Workflow broker, CI and delivery action | [#7](https://github.com/alex-engvall/labstride/issues/7) | W02, W03 |
| W05 — Directory cleanup action | [#8](https://github.com/alex-engvall/labstride/issues/8) | W03, W04 |
| W06 — CLI, installation and operations | [#9](https://github.com/alex-engvall/labstride/issues/9) | W02, W03, W04 |
| W07 — Public examples and prerelease | [#10](https://github.com/alex-engvall/labstride/issues/10) | W05, W06 |

## Implementation slices

| Slice | Issue | Requirements |
| --- | --- | --- |
| [W00.1] Verify GitHub repository and personal Project access | [#11](https://github.com/alex-engvall/labstride/issues/11) | LS-GH-001 |
| [W00.2] Prove workflow identity and runner-to-broker connectivity | [#12](https://github.com/alex-engvall/labstride/issues/12) | W00 workflow identity/connectivity discovery gate |
| [W00.3] Select the toolchain and finalize extension contract envelopes | [#13](https://github.com/alex-engvall/labstride/issues/13) | LS-EXT-001 |
| [W01.1] Persist independent run and resource lifecycles | [#14](https://github.com/alex-engvall/labstride/issues/14) | LS-CORE-001, LS-CORE-006 |
| [W01.2] Implement durable intents, claims and uncertain-outcome recovery | [#15](https://github.com/alex-engvall/labstride/issues/15) | LS-CORE-002, LS-CORE-003, LS-CORE-004 |
| [W01.3] Bound concurrency and implement truthful pause/cancel | [#16](https://github.com/alex-engvall/labstride/issues/16) | LS-CORE-005, LS-CORE-007 |
| [W01.4] Load pinned extensions and coordinate generic sessions | [#17](https://github.com/alex-engvall/labstride/issues/17) | LS-EXT-003, LS-EXT-005 |
| [W02.1] Compile installation configuration and typed field rules | [#18](https://github.com/alex-engvall/labstride/issues/18) | LS-CFG-001, LS-CFG-002, LS-CFG-003, LS-CFG-005 |
| [W02.2] Authorize requests and apply trusted policy changes | [#19](https://github.com/alex-engvall/labstride/issues/19) | LS-CFG-004, LS-GH-002 |
| [W02.3] Reconcile GitHub events and project progress safely | [#20](https://github.com/alex-engvall/labstride/issues/20) | LS-GH-003, LS-GH-004, LS-GH-005 |
| [W03.1] Enroll SSH targets and implement the trusted helper boundary | [#21](https://github.com/alex-engvall/labstride/issues/21) | LS-SSH-001, LS-SSH-002, LS-SEC-001 |
| [W03.2] Create exact-revision workspaces and recover interrupted creation | [#22](https://github.com/alex-engvall/labstride/issues/22) | LS-SSH-003, LS-SSH-004 |
| [W03.3] Make optional application runtimes recipe-owned | [#23](https://github.com/alex-engvall/labstride/issues/23) | LS-SSH-005 |
| [W04.1] Implement workflow dispatch, authenticated claims and reconciliation | [#24](https://github.com/alex-engvall/labstride/issues/24) | LS-DEP-001, LS-DEP-002, LS-DEP-004, LS-SEC-002 |
| [W04.2] Validate deployment receipts, target health and recovery | [#25](https://github.com/alex-engvall/labstride/issues/25) | LS-DEP-003, LS-DEP-006 |
| [W04.3] Gate autonomous merge on current-revision CI and protections | [#26](https://github.com/alex-engvall/labstride/issues/26) | LS-GH-006, LS-GH-007 |
| [W04.4] Serialize environment deployment and supersede stale revisions | [#27](https://github.com/alex-engvall/labstride/issues/27) | LS-DEP-005 |
| [W05.1] Select cleanup actions and enforce completion/retention checks | [#28](https://github.com/alex-engvall/labstride/issues/28) | LS-CLN-001, LS-CLN-002, LS-CLN-003 |
| [W05.2] Delete only owned workspace directories and reconcile interruption | [#29](https://github.com/alex-engvall/labstride/issues/29) | LS-CLN-004, LS-CLN-005 |
| [W06.1] Build installation, diagnostics and operator controls | [#30](https://github.com/alex-engvall/labstride/issues/30) | LS-OPS-001 |
| [W06.2] Back up, restore and upgrade active installations | [#31](https://github.com/alex-engvall/labstride/issues/31) | LS-OPS-002, LS-OPS-003 |
| [W06.3] Bound unattended work and retain redacted evidence | [#32](https://github.com/alex-engvall/labstride/issues/32) | LS-OPS-004, LS-OPS-005 |
| [W07.1] Publish extension conformance and prove a public-only installation | [#33](https://github.com/alex-engvall/labstride/issues/33) | LS-EXT-002, LS-EXT-004, LS-OSS-001 |
| [W07.2] Verify examples and publish traceable release documentation | [#34](https://github.com/alex-engvall/labstride/issues/34) | LS-OSS-003, LS-OSS-004 |
| [W07.3] Establish DCO checks and a verified private reporting route | [#35](https://github.com/alex-engvall/labstride/issues/35) | LS-SEC-003, LS-OSS-002 |

## Keeping tracking accurate

- [backlog.json](backlog.json) owns requirement status, acceptance criteria and verification evidence. Each requirement links its implementation issue.
- [work-packages.json](work-packages.json) owns package dependencies and links its tracker.
- [issue-index.json](issue-index.json) is the explicit mapping between package/task IDs, issue numbers and LS/AC IDs. GitHub owns the current issue state; the mapping does not duplicate it.
- Creating an issue or closing one does not implement or verify a requirement. Update evidence and status in the relevant implementation PR and regenerate the checklist.
- A scenario spanning several tasks passes only after all its expected behavior has evidence. Link the remaining integration coverage instead of marking partial coverage passed.
- If a task is split, preserve LS IDs, link the successor issues and update the mapping and parent checklist.

## Issue forms

| Form | Use | Main inputs |
| --- | --- | --- |
| Implementation task | A bounded slice of agreed work | Outcome, package, LS/AC IDs, scope, acceptance, verification and dependencies |
| Bug report | Unexpected behavior or a regression | Expected/actual result, reproduction, version, environment and redacted evidence |
| Feature proposal | A new user need | Problem, outcome, acceptance and possible approach |
| Connector or action proposal | A provider, connector, action, session provider or recipe | Capabilities, configuration, permissions, recovery and compatibility evidence |
| Documentation improvement | A spec, guide or example needs work | Location, problem, correction and verification |

[Open the issue chooser](https://github.com/alex-engvall/labstride/issues/new/choose). Blank issues remain available for work that does not fit a form. Forms are English, matching the public project language. They do not assign a person or a project automatically.

Form IDs are input identifiers, not GitHub Project field IDs. Form answers are rendered into the issue body and must be treated as untrusted request data. An implementation template does not install extensions, enable an agent or authorize merge/deploy. Those decisions belong to the separately configured and authenticated installation.

The documentation form applies the existing documentation label. Other forms use descriptive title prefixes and do not depend on unconfigured custom labels or issue types.

## GitHub references

- [Issue-form syntax](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)
- [GitHub form schema](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-githubs-form-schema)
- [Repository template setup](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository)
