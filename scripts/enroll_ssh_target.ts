// Local operator entrypoint. No network connection and no trust-on-first-use.
import { EnrollmentStore } from '../packages/connector-ssh/enrollment.ts';
import { readProtected } from '../packages/target-helper/filesystem.ts';
import type { Enrollment } from '../packages/connector-ssh/enrollment.ts';
process.umask(0o077);
try {
  if (process.argv.length !== 4) throw new Error();
  const input = JSON.parse(readProtected(process.argv[3]).toString('utf8')) as {
    enrollment: Enrollment; expectedRevision: number; actorId: string; reason: string;
  };
  if (Object.keys(input).sort().join(',') !== 'actorId,enrollment,expectedRevision,reason') throw new Error();
  const store = new EnrollmentStore(process.argv[2]);
  try { console.log(JSON.stringify(store.publish(input.enrollment, input.expectedRevision, { actorId: input.actorId, reason: input.reason }))); }
  finally { store.close(); }
} catch { process.stderr.write('enrollment_failed\n'); process.exitCode = 1; }
