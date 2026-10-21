# Security policy — prerelease

There are no supported released versions yet. Do not include credentials, private keys, access tokens, customer data or exploit details in public issues.

Before publishing the first repository release, the maintainer must enable and verify GitHub private vulnerability reporting or document another working private reporting route. This is a release gate, not an assertion that reporting is already available.

The threat model is in docs/11-security-and-trust.md. Principal boundaries are untrusted issue/PR content, installed executable extensions, SSH targets, privileged workflow jobs and the coordinator database.

A connector is trusted executable code, not an automatically sandboxed plugin. Never install code because an issue field names a URL. Use exact reviewed versions/digests, minimal credentials and an explicit allowed-operation policy.
