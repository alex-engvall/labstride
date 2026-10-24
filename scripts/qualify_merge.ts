import { loadInstallation } from '../packages/operations/runtime.ts';
import { credentialResolver } from '../packages/operations/github.ts';
import { GitHubMergeProvider } from '../packages/provider-github/merges.ts';
import { inspectExtension } from '../packages/extensions/loader.ts';
import { validated } from '../packages/storage-sqlite/validation.ts';
import type { MergeEnrollment } from '../packages/core/merges.ts';

// Read-only qualification of an existing owned merge/run; never submits a merge,
// changes configuration, or promotes an installation to enabled state.
try {
  const [installationFile, enrollmentName] = process.argv.slice(2);
  if (process.argv.length !== 4) throw Error('usage');
  const spec = loadInstallation(installationFile);
  const pin = spec.lock.extensions.find(pin => pin.id === 'labstride.github-merge' && pin.version === '1.0.0' && pin.kind === 'action');
  if (!pin) throw Error('merge_not_enrolled');
  inspectExtension(pin, spec.host);
  const enrollments = pin.configuration.enrollments as Record<string, MergeEnrollment>;
  const enrollment = validated('merge-enrollment', Object.hasOwn(enrollments, enrollmentName) ? enrollments[enrollmentName] : null) as MergeEnrollment;
  const provider = new GitHubMergeProvider({ credential: credentialResolver(spec), identity(reference) {
    const binding = spec.credentials[reference];
    if (!binding || typeof binding === 'string' || binding.permissions.contents !== 'write') return null;
    return { appId: Number(binding.appId), installationId: binding.installationId, repositoryIds: binding.repositoryIds, contents: 'write' };
  } });
  const proof = enrollment.qualification;
  const report = await provider.qualify(enrollment, proof.mergeSha, proof.runId);
  process.stdout.write(JSON.stringify(report) + '\n');
  if (!report.qualified) process.exitCode = 1;
} catch {
  process.stderr.write(JSON.stringify({ schemaVersion: '1.0', qualified: false, blocker: 'merge_qualification_unavailable' }) + '\n');
  process.exitCode = 1;
}
