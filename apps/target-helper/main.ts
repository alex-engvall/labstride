import { pathToFileURL } from 'node:url';
import { readProtected } from '../../packages/target-helper/filesystem.ts';
import { TargetRegistry, validateHelperRequest } from '../../packages/target-helper/registry.ts';
import type { HelperPolicy } from '../../packages/target-helper/registry.ts';
import { validated } from '../../packages/storage-sqlite/validation.ts';

export async function serve(policyFile: string, input: AsyncIterable<Uint8Array>, output: (text: string) => void): Promise<void> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of input) {
    size += chunk.length;
    if (size > 262144) throw new Error('validation_failed');
    chunks.push(Buffer.from(chunk));
  }
  const request: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  validated('ssh-helper-request', request);
  // The policy file and executable are installed by the operator. Its path is
  // part of the fixed forced command, never taken from the stdin payload.
  const policy = validated<HelperPolicy>('ssh-helper-policy', JSON.parse(readProtected(policyFile).toString('utf8')));
  validateHelperRequest(policy, request);
  const registry = new TargetRegistry(policy);
  try { output(JSON.stringify(registry.handle(request))); } finally { registry.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.umask(0o077);
  const timeout = setTimeout(() => process.exit(1), 65000);
  try {
    if (process.argv.length !== 3) throw new Error('validation_failed');
    await serve(process.argv[2], process.stdin, text => process.stdout.write(text));
  } catch { process.stderr.write('validation_failed\n'); process.exitCode = 1; }
  finally { clearTimeout(timeout); }
}
