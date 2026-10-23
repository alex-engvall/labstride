import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, parse } from 'node:path';

export class TargetError extends Error {
  readonly code: 'validation_failed' | 'forbidden' | 'identity_mismatch' | 'configuration_invalid' |
    'unsupported_capability' | 'resource_busy' | 'outcome_unknown' | 'operation_failed' | 'authentication_failed' | 'transient_unavailable';
  constructor(code: TargetError['code']) { super(code); this.code = code; }
}
export interface PathIdentity { device: number; inode: number; mountId: number; uid: number }
const fail = (): never => { throw new TargetError('forbidden'); };

// Linux only. Every ancestor must be non-symlink and outside the coding user's
// write authority. Root-owned sticky /tmp is allowed for disposable installations.
export function protectedPath(path: string, directory = true, owner = process.getuid!()): void {
  if (!isAbsolute(path) || path === '/' || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path) fail();
  let current = path;
  for (;;) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || ![0, owner].includes(stat.uid)) fail();
    if ((stat.mode & 0o022) && !(current !== path && stat.uid === 0 && (stat.mode & 0o1000))) fail();
    if (current === path && (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)) fail();
    if (current === parse(current).root) break;
    current = dirname(current);
  }
}

export function readProtected(path: string, owner = process.getuid!(), limit = 262144): Buffer {
  protectedPath(path, false, owner);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit || ![0, owner].includes(stat.uid) || (stat.mode & 0o022)) fail();
    const bytes = readFileSync(fd);
    if (bytes.length > limit) fail();
    return bytes;
  } finally { closeSync(fd); }
}

function identity(fd: number): PathIdentity {
  const stat = fstatSync(fd);
  const match = /^mnt_id:\s+(\d+)$/m.exec(readFileSync(`/proc/self/fdinfo/${fd}`, 'utf8'));
  if (!match || !stat.isDirectory()) return fail();
  return { device: stat.dev, inode: stat.ino, mountId: Number(match[1]), uid: stat.uid };
}
export function rootIdentity(path: string, owner = process.getuid!()): PathIdentity {
  protectedPath(path, true, owner);
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { return identity(fd); } finally { closeSync(fd); }
}
export function sameIdentity(left: PathIdentity, right: PathIdentity): boolean {
  return left.device === right.device && left.inode === right.inode && left.mountId === right.mountId && left.uid === right.uid;
}

// Holds the enrolled root descriptor through the caller's bounded registry work.
// The coding user cannot rename its protected parent. Recheck both identities
// before commit; no recursive traversal or deletion is offered by W03.1.
export function withRoot<T>(path: string, expected: PathIdentity, work: (assertAbsent: (name: string) => void) => T): T {
  protectedPath(path, true, expected.uid);
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const check = () => { if (!sameIdentity(identity(fd), expected) || !sameIdentity(rootIdentity(path, expected.uid), expected)) fail(); };
    check();
    const absent = (name: string) => {
      if (!/^ws-[a-f0-9]{40}$/.test(name)) fail();
      try { lstatSync(join(`/proc/self/fd/${fd}`, name)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { check(); return; } throw error; }
      throw new TargetError('resource_busy');
    };
    const result = work(absent); check(); return result;
  } finally { closeSync(fd); }
}

export function assertPrivateDatabase(directory: string, basename: string): void {
  protectedPath(directory);
  if ((lstatSync(directory).mode & 0o077) !== 0) fail();
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const path = join(directory, basename + suffix);
    try {
      protectedPath(path, false);
      if ((lstatSync(path).mode & 0o077) !== 0) fail();
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
