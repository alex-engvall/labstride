# 33 — Enrolled SSH targets and trusted helper

W03.1 / [#21](https://github.com/alex-engvall/labstride/issues/21) implements LS-SSH-001, LS-SSH-002 and the target identity separation in LS-SEC-001. The [evidence](evidence/W03.1-ssh-boundary-2026-10-23.md) separates executable Linux/SSH results from remaining workspace, cleanup and session integration. This slice reserves registry identities; it never reports a source checkout as ready.

## Enrollment and rotation

`EnrollmentStore` is a local operator API. Its existing state directory must be private, owned by the coordinator identity and separate from source directories. `publish(enrollment, expectedRevision, {actorId, reason})` validates the [v1 enrollment](../schemas/ssh-enrollment.schema.json), checks authentication-file ancestry, compares the current revision, and atomically appends the immutable enrollment and audit record. New targets start at revision 1 with expected revision 0. Existing targets require the exact previous revision. The returned connector configuration contains only the directory reference, target ID, revision and enrollment digest.

```sh
node scripts/enroll_ssh_target.ts TRUSTED_ENROLLMENT_DIRECTORY TRUSTED_INPUT_FILE
```

The protected input file contains `enrollment`, `expectedRevision`, `actorId` and `reason`. Enrollment binds installation/target identities, host, port, login user, an explicitly verified Ed25519 public host key, private authentication-file reference, fixed absolute helper command, permitted root IDs and timeout. The [example](../examples/ssh-enrollment.json) is synthetic and not enabled configuration. No key is discovered or accepted by this command.

Obtain the public host key through an independently authenticated operator/provider channel. An unauthenticated scan is insufficient. For rotation, independently verify the replacement key, publish the next enrollment revision with its reason, update the protected helper's target revision and activate newly compiled configuration for new runs. Active operations keep their original snapshots. The connector compares the saved revision/digest with current enrollment before each request and blocks retired profiles. An operator must reconcile original operations and explicitly resolve their authority before continuing; a newer key is never silently substituted into an old operation. Publication cannot undo an effect already dispatched before a revision changed.

## SSH transport and installed contracts

The public `labstride.connector.ssh` artifact uses the existing integrity-checked loader and a self-contained builtin-only module. Its configuration schema is checked during configuration compilation. `scripts/package_extension.mjs` packages its reviewed helper schemas with local references expanded; session packaging remains compatible. Payloads cannot fetch schemas, load extensions, add SSH options or choose executable code.

`targetResolver` validates inputs/outputs, restricts methods to the frozen profile's granted capabilities and checks target, operation, digest, workspace, root and locator correlation. `connectorContracts` exposes the existing versioned connector `probe`, `execute` and `inspect` envelopes. Inspect resolves the original immutable operation through a trusted store callback; handles are not filesystem paths. Upload, download and cancel return `unsupported_capability`.

OpenSSH receives argument arrays, a fresh private known-hosts file, strict host checking and a generated host-key alias. It ignores user/global SSH configuration and known-hosts files and disables interactive authentication, agent forwarding, multiplexing, forwarding and proxy commands. Only the enrolled fixed helper command reaches the remote shell; JSON travels through stdin. The subprocess uses a minimal environment and timeout. Stdout is bounded at 256 KiB, retained stderr at 16 KiB. Stable errors expose no raw SSH output, source-module data URLs, keys or paths. Lost or invalid effect replies remain uncertain.

## Helper and authority separation

Install reviewed helper code, runtime, launcher and [policy](../schemas/ssh-helper-policy.schema.json) outside workspace-writable directories. Use distinct coordinator, helper and coding OS identities. The helper runs without root or general sudo authority. Its SSH key must select a fixed forced command with forwarding, PTY and user-rc access disabled. Coding cannot write that authorized-keys file, launcher, release or policy. The launcher starts the helper with a clean environment and fixed policy path.

The helper validates bounded JSON, schema version, target identity, operation digest, action/version and root selection before opening the request's registry. Policy cannot arrive over stdin. Invalid envelopes or inaccessible/writable policy fail closed.

| Method | Observable result |
| --- | --- |
| `probe` | Recheck enrolled roots and report the three implemented capabilities |
| `reserve` | Atomically retain one installation/target/workspace/operation-bound reservation |
| `inspect` | Read that original reservation, or preserve `outcome_unknown` |

The separate SQLite registry uses schema version 1, synchronous durable commits, immutable reservation rows and unique operation/workspace identities. Different digests or owners conflict. Source locators are derived from installation/target/workspace identity. Existing paths are never adopted. Success means `state=reserved`, no created checkout and no disposable resource claim. Core workspace state remains unchanged.

Root ancestors must have protected ownership and permissions. The helper holds a directory descriptor, checks device/inode/UID/Linux mount ID, refuses links and rechecks identity before commit. Registry state must be private and outside source roots. Unmanaged databases and linked database/sidecar paths are rejected. There is no recursive traversal, arbitrary shell, clone, session, deployment or deletion operation.

Root authority can defeat this boundary. Separate directories do not isolate hostile code sharing an OS UID. Target restart/remount may change a mount ID; requalification is an explicit operator task. W05 must add quiescence, safe movement/deletion, dirty/unpushed checks and tombstones before cleanup is available.

## Durable execution and recovery

`createTargetReservationAction` supplies `labstride.target-reserve@1.0.0` to the existing worker. Trusted embedding code supplies its connector binding. `startExecution` can register the adapter with `installedTargets: {host}`; `configuredTargetAction` obtains target settings and connector pins from the original run snapshot. Configured admission and policy grants remain mandatory. This option neither grants authority nor activates configuration.

The worker persists intent and crosses its existing effect boundary before reserve. After a crash or lost reply it only inspects the original operation. A committed reservation is recovered; absent, conflicting or unavailable receipts never permit another reserve. Timeout grants no executor takeover. Direct results contain no fabricated GitHub workflow identity or workspace-ready fact.

```sh
node scripts/probe_ssh_target.ts TRUSTED_PROBE_FILE
```

This opt-in operator probe consumes explicit connector configuration, artifact path, installation/root identity and a complete operation. It probes, inspects first, durably records first-dispatch intent, reserves at most once and re-inspects. Repeating its descriptor observes the retained reservation. Missing receipts after recorded dispatch remain blocked/unknown. The probe is not a service installer, authorized GitHub start or backup/restore qualification.

## Pilot and verification

The selected pilot uses separate Node 24.22.0, a root-owned release/launcher, private helper/coordinator state, a dedicated coding account and restricted helper key. Existing runtime/agent services and system host keys were retained. Keys, paths and provider identities stay outside this repository. HostUp and Tailscale are operator-selected provisioning/network tools, not public-code dependencies.

Synthetic credential markers were used. Coding hooks inherit no projection/deploy credentials, cannot alter protected files and cannot execute the helper as its trusted UID. Hook data still requires W01/W02 correlation, independent observation and policy checks; reported completion or approval grants no authority.

No interactive session was started or enrolled as the new pilot coding account. Later workspace/session integration must independently verify its effective OS identity. The retained existing backend is outside this new account's isolation proof.

```sh
node --test --test-isolation=none tests/ssh-target.test.mjs tests/ssh-transport.test.mjs
```

Transport cases require an isolated root-operated Linux host with `/usr/sbin/sshd`. New loopback listeners/test keys use protected temporary `/run` directories; StrictModes and host checking remain enabled. Teardown stops only test-owned listeners. Missing prerequisites produce explicit skips. Helper/register tests require real Linux ownership observations; remapped sandbox metadata is not host-boundary evidence. `probe_target_isolation.mjs` separately runs controlled access/direct-helper attacks as the coding user with a clean environment and synthetic hook report.

AC06/AC07 have evidence for the tested profile. AC19 has root/path refusal evidence only; guarded deletion remains W05. AC35/AC36 require complete GitHub/workspace/session integration. LS-SSH-003/004/005 and full W03 delivery remain #22/#23 work.

On installation failure, restrict only its enrolled access and retain unresolved state. Inspect original identities before rollback. There is no down migration, automatic key fallback, force adoption or blanket cleanup. The pilot and reservations remain for the next package; temporary bootstrap access is removed independently of the persistent restricted helper key.
