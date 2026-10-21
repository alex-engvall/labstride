# Implementation reading and execution guide

1. Read root AGENTS.md, 01-product-and-scope.md, 02-design-context.md and 15-decisions.md.
2. Select the current package in 14-work-packages.md and its entries in backlog.json.
3. Read the relevant lifecycle/configuration/provider/extension specs, JSON schemas and acceptance cases.
4. Inspect actual code and toolchain before assuming a command exists.
5. Implement a small complete slice, including behavior, typed errors, recovery and evidence.
6. Update JSON backlog, regenerate the readable checklist and update the relevant normative spec in the same PR.

Do not treat every requirement as one PR or combine an entire package merely because it shares a number. Prefer the smallest end-to-end outcome that can be honestly verified.

Status progression: planned -> in_progress -> implemented -> verified. Implemented requires code and local behavior coverage; verified additionally requires all acceptance criteria/evidence for the promised environment. A partially working feature remains in_progress with notes, not verified.

Start with W00. Run its short integration probes before building UI/packaging. The external session-provider compatibility probe should happen early in parallel with foundation work where humans/agents are available; this is sequencing advice, not an instruction to spawn agents automatically.

For each handoff report: changed behavior, requirement IDs, evidence, what remains unverified and the next work package. Do not claim production readiness from documentation validation.
