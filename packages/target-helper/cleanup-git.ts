import { closeSync, constants, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { digest } from '../configuration/json.ts';
import type { SourceAccess } from './workspace-git.ts';

export interface GitInspection { blockers: string[]; counts: { tracked: number; untracked: number; ignored: number; unpushed: number }; remoteRefsDigest: string | null }
export interface CleanupGitOptions {
  // Test transport substitution is a trusted embedding seam, never request data.
  remote?: string;
  allowFileTransport?: boolean;
}
// Never run Git with the coding-controlled config, hooks, alternate object paths,
// index or refs as writable state. Copy a bounded metadata snapshot without links
// into a private, disposable repository; remote reads update only that repository.
export function inspectCleanupGit(path: string, source: SourceAccess, regenerable: string[], options: CleanupGitOptions = {}): GitInspection {
  const result: GitInspection = { blockers: [], counts: { tracked: 0, untracked: 0, ignored: 0, unpushed: 0 }, remoteRefsDigest: null };
  const scratch = mkdtempSync(join(tmpdir(), 'labstride-cleanup-'));
  const block = (code: string) => { if (!result.blockers.includes(code)) result.blockers.push(code); };
  let bytes = 0, files = 0;
  const copy = (from: string, to: string, optional = false): void => {
    let stat; try { stat = lstatSync(from); } catch (error) { if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    if (++files > 30000 || stat.isSymbolicLink()) throw Error();
    if (stat.isDirectory()) { mkdirSync(to, { recursive: true, mode: 0o700 }); for (const name of readdirSync(from)) copy(join(from, name), join(to, name)); return; }
    if (!stat.isFile() || stat.nlink !== 1 || (bytes += stat.size) > 256 * 1024 * 1024) throw Error();
    const fd = openSync(from, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = fstatSync(fd);
      if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size !== stat.size) throw Error();
      const data=Buffer.alloc(stat.size+1);let count=0;
      while(count<data.length){const n=readSync(fd,data,count,data.length-count,null);if(!n)break;count+=n;}
      if(count!==stat.size)throw Error();
      mkdirSync(dirname(to),{recursive:true,mode:0o700});
      writeFileSync(to, data.subarray(0,stat.size), { mode: 0o600 });
    } finally { closeSync(fd); }
  };
  const env: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin', HOME: '/', LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/bin/false', GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1' };
  const gitDir = join(scratch, '.git');
  const run = (args: string[], auth = false) => {
    const childEnv = { ...env };
    if (auth && source.token) Object.assign(childEnv, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `http.${source.binding.gitUrl}.extraheader`,
      GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`x-access-token:${source.token}`).toString('base64')}` });
    if (auth && process.env.NODE_EXTRA_CA_CERTS) childEnv.GIT_SSL_CAINFO = process.env.NODE_EXTRA_CA_CERTS;
    return execFileSync('/usr/bin/git', ['--no-optional-locks', '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always',
      ...(options.allowFileTransport ? ['-c', 'protocol.file.allow=always'] : []), '-c', 'credential.helper=', '-c', 'http.followRedirects=false',
      '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'core.excludesFile=/dev/null', '-c', 'core.filemode=true',
      '-c', 'diff.external=', `--git-dir=${gitDir}`, `--work-tree=${path}`, ...args],
    { cwd: scratch, env: childEnv, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  };
  try {
    if (!lstatSync(join(path, '.git')).isDirectory() || lstatSync(join(path, '.git')).isSymbolicLink()) throw Error();
    mkdirSync(gitDir); run(['init', '--template=', scratch]);
    const original = join(path, '.git');
    // Shallow history is completed only in scratch before proving preservation. Linked worktrees,
    // grafts and alternate/replacement object graphs require separate support.
    for (const name of ['commondir', 'info/grafts', 'objects/info/alternates', 'objects/info/http-alternates']) {
      try { if (lstatSync(join(original, name)).size > 0) throw Error(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    for (const name of ['objects', 'refs', 'logs']) copy(join(original, name), join(gitDir, name), true);
    for (const name of ['HEAD', 'index', 'packed-refs', 'shallow']) copy(join(original, name), join(gitDir, name), name !== 'HEAD');
    copy(join(original, 'info/exclude'), join(gitDir, 'info/exclude'), true);
    if (run(['for-each-ref', '--format=%(refname)', 'refs/replace']).trim()) throw Error();
    const localTips = new Set(run(['for-each-ref', '--format=%(objectname)']).trim().split('\n').filter(Boolean));
    localTips.add(run(['rev-parse', '--verify', 'HEAD']).trim());
    const flags = run(['ls-files', '-v', '-z']).split('\0').filter(Boolean);
    if (flags.some(line => /^[a-zS]/.test(line))) block('index_flags_unsupported');
    if (run(['ls-files', '--stage', '-z']).split('\0').some(line => line.startsWith('160000 '))) block('submodule_unsupported');
    // diff-files/diff-index do not refresh or write the original index. Explicit
    // no-ext-diff/no-textconv prevents source-configured executable helpers.
    const changed = new Set([...run(['diff-files', '--no-ext-diff', '--no-textconv', '--name-only', '-z']).split('\0'),
      ...run(['diff-index', '--cached', '--no-ext-diff', '--no-textconv', '--name-only', '-z', 'HEAD']).split('\0')].filter(Boolean));
    result.counts.tracked = changed.size;
    if (changed.size) block('tracked_changes');
    const untracked = run(['ls-files', '--others', '--exclude-standard', '--exclude=.git', '-z']).split('\0').filter(file=>file && file!=='.git' && !file.startsWith('.git/'));
    result.counts.untracked = untracked.length; if (untracked.length) block('untracked_work');
    const ignored = run(['ls-files', '--others', '--ignored', '--exclude-standard', '--exclude=.git', '-z']).split('\0').filter(file=>file && file!=='.git' && !file.startsWith('.git/'));
    result.counts.ignored = ignored.filter(file => !regenerable.some(prefix => file === prefix || file.startsWith(prefix + '/'))).length;
    if (result.counts.ignored) block('undeclared_ignored_work');
    // Reflogs can retain work that is no longer named by a local branch.
    for (const tip of run(['rev-list', '--reflog', '--all']).trim().split('\n').filter(Boolean)) localTips.add(tip);
    const remote = options.remote ?? source.binding.gitUrl;
    const shallow = run(['rev-parse','--is-shallow-repository']).trim()==='true';
    run(['fetch', ...(shallow?['--unshallow']:[]), '--no-tags', '--no-write-fetch-head', remote, '+refs/heads/*:refs/verified/heads/*', '+refs/tags/*:refs/verified/tags/*'], true);
    const fetched = run(['for-each-ref', '--format=%(objectname) %(refname)', 'refs/verified']).trim().split('\n').filter(Boolean)
      .map(line => line.replace(' refs/verified/heads/', ' refs/heads/').replace(' refs/verified/tags/', ' refs/tags/')).sort();
    const advertised = run(['ls-remote', '--refs', remote, 'refs/heads/*', 'refs/tags/*'], true).trim().split('\n').filter(Boolean).map(line => line.replace(/\s+/, ' ')).sort();
    if (!fetched.length || digest(fetched) !== digest(advertised)) throw Error();
    if(run(['rev-parse','--is-shallow-repository']).trim()!=='false')throw Error();
    result.remoteRefsDigest = digest(advertised);
    const remoteTips = fetched.map(line => line.split(' ')[0]);
    result.counts.unpushed = run(['rev-list', ...localTips, '--not', ...remoteTips]).trim().split('\n').filter(Boolean).length;
    if (result.counts.unpushed) block('unpushed_commits');
  } catch { block('git_inspection_unknown'); }
  finally { rmSync(scratch, { recursive: true }); }
  return result;
}
