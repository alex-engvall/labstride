import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { LifecycleError } from '../core/lifecycle.ts';

// Resolve existing parents as well as paths not yet created. This performs no writes.
export function canonicalPath(path: string): string {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new LifecycleError('unsafe_state_path');
  let existing = path;
  const suffix: string[] = [];
  for (;;) {
    try { return join(realpathSync(existing), ...suffix); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(existing) === existing)
        throw new LifecycleError('unsafe_state_path');
      try {
        // A dangling link is an existing path with an unresolved destination; never treat it as a missing directory.
        if (lstatSync(existing).isSymbolicLink()) throw new LifecycleError('unsafe_state_path');
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') throw new LifecycleError('unsafe_state_path');
      }
      suffix.unshift(basename(existing)); existing = dirname(existing);
    }
  }
}

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}
export function assertSeparate(dataDir: string, workspacePath: string): void {
  const workspace = canonicalPath(workspacePath);
  if (contains(dataDir, workspace) || contains(workspace, dataDir)) throw new LifecycleError('unsafe_state_path');
}

export function assertDatabaseFiles(dataDir: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try {
      const file = lstatSync(join(dataDir, `state.sqlite${suffix}`));
      if (!file.isFile() || file.nlink !== 1) throw new LifecycleError('unsafe_state_path');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new LifecycleError('unsafe_state_path');
    }
  }
}
