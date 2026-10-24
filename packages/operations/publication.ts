import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runGit } from '../target-helper/workspace-git.ts';

export interface PublicationIdentity { sha: string; baseSha: string; branch: string }
export interface PublicationBundle extends PublicationIdentity { bundle: string }

/** Prepare and verify objects without credentials or an external mutation intent. */
export function preparePublication(input: PublicationBundle, expected: PublicationIdentity, git: typeof runGit = runGit) {
  if (!input || typeof input !== 'object' || expected.sha.length !== 40 || expected.baseSha.length !== 40 ||
    !/^[a-f0-9]{40}$/.test(expected.sha) || !/^[a-f0-9]{40}$/.test(expected.baseSha) ||
    input.sha !== expected.sha || input.baseSha !== expected.baseSha || input.branch !== expected.branch ||
    typeof input.bundle !== 'string') throw Error('identity_mismatch');
  if (input.bundle.length > Math.ceil(16 * 1024 * 1024 / 3) * 4) throw Error('bundle_too_large');
  const bytes = Buffer.from(input.bundle, 'base64');
  if (bytes.length > 16 * 1024 * 1024) throw Error('bundle_too_large');
  const invoke = (stage: string, directory: string, args: string[]) => {
    try { return git(directory, args); } catch { throw Error(`publication_${stage}_failed`); }
  };
  const temp = mkdtempSync(join(tmpdir(), 'labstride-publish-'));
  const close = () => rmSync(temp, { recursive: true, force: true });
  try {
    const file = join(temp, 'source.bundle'), bare = join(temp, 'objects.git');
    writeFileSync(file, bytes, { mode: 0o600, flag: 'wx' });
    invoke('init', temp, ['init', '--bare', '--template=', 'objects.git']);
    invoke('bundle', bare, ['bundle', 'verify', file]);
    // Only the already-enrolled source revision is a permitted history boundary.
    // A bundle from a depth-one checkout does not transport .git/shallow.
    writeFileSync(join(bare, 'shallow'), expected.baseSha + '\n', { mode: 0o600, flag: 'wx' });
    invoke('import', bare, ['-c', 'protocol.file.allow=always', 'fetch', '--no-tags', '--no-recurse-submodules', file, 'HEAD']);
    if (invoke('head', bare, ['rev-parse', 'FETCH_HEAD']) !== expected.sha) throw Error('identity_mismatch');
    invoke('ancestry', bare, ['merge-base', '--is-ancestor', expected.baseSha, expected.sha]);
    if (!invoke('diff', bare, ['diff-tree', '--no-commit-id', '--name-only', '-r', '--no-ext-diff', '--no-textconv', expected.baseSha, expected.sha])) throw Error('empty_result');
    if (invoke('workflows', bare, ['diff', '--name-only', expected.baseSha, expected.sha, '--', '.github/workflows'])) throw Error('ci_definition_changed');
    const commits = invoke('history', bare, ['log', '--format=%B%x00', `${expected.baseSha}..${expected.sha}`]).split('\0').map(message => message.trim()).filter(Boolean);
    if (!commits.length || commits.some(message => !/^Signed-off-by: .+ <[^<>\s]+@[^<>\s]+>$/m.test(message))) throw Error('dco_missing');
    return { bare, close };
  } catch (error) { close(); throw error; }
}
