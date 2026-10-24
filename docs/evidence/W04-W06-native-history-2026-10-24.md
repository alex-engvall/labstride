# Native first-turn history qualification — 2026-10-24

Scope: the opt-in checked delivery profile in W01.4/W02/bounded W04/W06. Full W04/W06/W07 and native issue-to-review acceptance remain open.

## Live finding and preserved outcome

After the implementation PR was merged by the operator, the installed revision passed doctor and negative access checks and the services were enabled for boot persistence. The actual canary had an inert first observation followed by one fresh authorized Approved transition. Its actual isolated checkout matched merged main; all three missing AI fields received Plan/GPT-6.1 Sol/Medium defaults, and Path and Codex session came from registered results. No field conflict was observed.

Before its first native turn, the daemon rejected history access. The managed operation retained `outcome_unknown` and sent no replacement instruction. Bounded protocol error inspection subsequently identified `-32601: list_turns is not supported yet` for the new thread's default paginated history. Full read/resume also depended on that unsupported route. Schema presence and backend version alone did not establish this runtime capability. Preserve the original run, checkout, registered session and uncertain delivery; this correction does not repair their receipt or replay them.

## Adopted correction

[ADR-007](../adr/0007-checked-codex-delivery.md) now requires explicitly selected legacy history and a process-local fresh creation/activity witness for the exact pre-first-message unmaterialized rejection. Receipt/path/idle checks still apply. Existing threads, missing methods, mismatched errors, manual activity, disconnect/restart and observation overflow never create that witness. The remaining read/effect concurrency race is unchanged and explicitly non-atomic.

The qualified daemon supports full turn views through `thread/turns/list`, while `thread/items/list` is unavailable. Reports therefore require an explicitly full snapshot of the same latest completed native turn. A changed turn or a summary in place of full data blocks publication. The conservative provider retains its public rejection code and existing refusal of unsupported guarded sends; bounded native error detail is available to the opt-in bridge.

## Executed live protocol probe

A separate owned temporary directory and native legacy thread were used for a journaled, tool-free Plan probe on the existing authenticated Codex 0.163.0 daemon. Its sole prompt prohibited tools, file changes and implementation. One real native Plan turn completed. Current-turn identity/status and the explicitly full user-message/plan items were read from the supported API. Settings-preserving resumption succeeded and that completed probe was archived. The empty metadata probes were also archived. Actual empty-thread creation notifications included MCP startup metadata; this is distinguished from task, queue and model/settings activity in the first-turn guard. No implementation, credentials, second backend or canary replacement delivery was involved.

These checks qualify the runtime history shape, native Plan response and resumption. They do not prove dynamic result reporting, user plan approval, implementation or PR publication. Controlled regression evidence covers exact error matching, creation-time manual activity, disconnect/overflow, full-view revision checks and report correlation. Installation of this correction, a new independent approved canary and its actual user approval remain live gates. Temporary installation root access was revoked and its private key files destroyed before the original canary started.

## Local regression verification

The final full Node suite passed 530 of 538 tests with zero failures and eight explicit root/sshd skips. All 24 focused native bridge, conservative provider and workflow tests passed. Type checking of 70 generated contracts, documentation/schema validation (55 schema/example pairs), generated checklist verification and all six Python tests passed. The native protocol probe above is separate live evidence; neither these tests nor that probe pass the remaining user-approved issue-to-PR canary.
