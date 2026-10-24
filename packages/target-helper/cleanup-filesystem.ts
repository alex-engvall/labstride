import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, readdirSync, readlinkSync, rmdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { directoryIdentity, sameIdentity, TargetError } from './filesystem.ts';
import type { PathIdentity } from './filesystem.ts';
import type { WorkspacePolicy } from './workspace-contracts.ts';

export const syncDirectory = (path: string): void => {
  const fd = openSync(/^\/proc\/self\/fd\/\d+$/.test(path)?path+'/.':path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
};
export function absent(path: string): boolean {
  try { lstatSync(path); return false; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true; throw error; }
}
// This profile is intentionally restrictive: a coding principal with any live
// process blocks cleanup, even if the process appears idle or works elsewhere.
// Qualification asserts host PID/proc visibility; namespaces/hidepid/unknown
// reads fail closed. Privileged/helper code is trusted and never agent code.
export function assertNoWriters(policy: WorkspacePolicy): void {
  if (process.platform !== 'linux' || process.getuid!() !== 0 || policy.helperUid !== 0 ||
    !/^\s*0\s+0\s+4294967295\s*$/.test(readFileSync('/proc/self/uid_map', 'utf8')) ||
    /^NSpid:\s+\d+\s+\d/m.test(readFileSync('/proc/self/status', 'utf8')) ||
    /\bhidepid=(?!0\b)/.test(readFileSync('/proc/mounts', 'utf8'))) throw new TargetError('unsupported_capability');
  for (const pid of readdirSync('/proc').filter(name => /^\d+$/.test(name))) {
    try {
      const status = readFileSync(`/proc/${pid}/status`, 'utf8');
      const uids = /^Uid:\s+(.+)$/m.exec(status)?.[1].trim().split(/\s+/).map(Number);
      const gids = /^Gid:\s+(.+)$/m.exec(status)?.[1].trim().split(/\s+/).map(Number);
      const groups = /^Groups:\s*(.*)$/m.exec(status)?.[1].trim().split(/\s+/).filter(Boolean).map(Number);
      if (!uids || !gids || !groups) throw new TargetError('outcome_unknown');
      if (uids.includes(policy.codingUid) || (!uids.every(uid => uid === policy.helperUid) && [...gids, ...groups].includes(policy.codingGid))) throw new TargetError('resource_busy');
      // A foreign unprivileged process might retain a handle granted earlier.
      // Without a supported identity-isolated process profile, retain instead.
      if (uids.some(uid => uid !== 0 && uid !== policy.helperUid)) throw new TargetError('resource_busy');
      // Force readable per-process metadata; an inaccessible process is unknown.
      readlinkSync(`/proc/${pid}/ns/mnt`);
    } catch (error) {
      // A disappeared process could have handed a descriptor to a child.
      // A changing/inaccessible process inventory is not proof of quiescence.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ESRCH') throw new TargetError('outcome_unknown');
      throw error;
    }
  }
}
// All traversal uses held descriptors and O_NOFOLLOW. The coding identity is
// fenced and has no processes before entry; root/helper mutation is out of scope.
export function walkOwned(path: string, expected: PathIdentity, policy: WorkspacePolicy, remove = false, afterUnlink?: () => void): void {
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    if (!sameIdentity(directoryIdentity(`/proc/self/fd/${fd}/.`), expected) || !sameIdentity(directoryIdentity(path), expected)) throw new TargetError('identity_mismatch');
    const base = `/proc/self/fd/${fd}`;
    for (const name of readdirSync(base)) {
      const child = join(base, name), stat = lstatSync(child);
      if (![policy.helperUid, policy.codingUid].includes(stat.uid) || (stat.isFile() && stat.nlink !== 1)) throw new TargetError('identity_mismatch');
      if (stat.isDirectory()) {
        const identity = directoryIdentity(child);
        if (identity.device !== expected.device || identity.mountId !== expected.mountId) throw new TargetError('identity_mismatch');
        walkOwned(child, identity, policy, remove, afterUnlink);
        if (remove) { rmdirSync(child); afterUnlink?.(); }
      } else if (stat.isFile() || stat.isSymbolicLink()) {
        // A bind-mounted file can have the same device. Obtain its mount ID
        // without following symlinks or opening FIFOs/devices (Linux O_PATH).
        const entry = openSync(child, 0x200000 | constants.O_NOFOLLOW);
        try {
          const opened = fstatSync(entry), mount = /^mnt_id:\s+(\d+)$/m.exec(readFileSync(`/proc/self/fdinfo/${entry}`, 'utf8'));
          if (opened.ino !== stat.ino || opened.dev !== stat.dev || !mount || Number(mount[1]) !== expected.mountId) throw new TargetError('identity_mismatch');
        } finally { closeSync(entry); }
        if (remove) { unlinkSync(child); afterUnlink?.(); }
      } else throw new TargetError('unsupported_capability');
    }
    if (remove) fsyncSync(fd);
  } finally { closeSync(fd); }
}
