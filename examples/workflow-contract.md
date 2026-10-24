# Repository workflow implementation outline

The workflow is owned by the application/operator repo. The [W04.1 protocol](../docs/38-workflow-broker.md) and [reference workflow/client](../tools/workflow-runner/workflow.example.yml) implement the boundary below. The reference enables no installed workflow and requires a reviewed repository-owned delivery module.

1. Accept workflow_dispatch inputs operation_id, request_digest and schema_version.
2. Run from an enrolled trusted workflow revision and select the declared target environment.
3. Grant contents:read and id-token:write only where needed; add provider privileges separately and explicitly.
4. Obtain an OIDC token for the configured broker audience, then claim the operation.
5. Verify request digest, target, source SHA and permitted action. A losing/rejected claim exits before any mutation.
6. Use the operation's exact source SHA or verified artifact digest, not an implicit branch tip.
7. Obtain one-time policy-checked effect permission. Never retry permission or execution after a lost response. Execute the repository's own create/deploy/cleanup implementation. Record effects and observations.
8. Send the bound receipt even for a known failure; if completion cannot be proved, use outcome_unknown.
9. Retain redacted evidence as an artifact if configured. Do not log tokens or use artifacts as executable instructions.

Third-party actions must be pinned to reviewed immutable commits in the eventual YAML. No nonexistent Labstride action release is referenced in this outline.
