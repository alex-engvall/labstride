// Reviewed self-contained connector artifact. Only Node builtins are imported.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' :
  value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const fail = code => { throw new Error(code); };
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
function protectedPath(path, directory, privateMode = false) {
  if (typeof path !== 'string' || !/^\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/.test(path) || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path) fail('forbidden');
  let current = path;
  for (;;) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || ![0, process.getuid()].includes(stat.uid) ||
      ((stat.mode & 0o022) && !(current !== path && stat.uid === 0 && (stat.mode & 0o1000)))) fail('forbidden');
    if (current === path && (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)) fail('forbidden');
    if (current === path && privateMode && (stat.mode & 0o077)) fail('forbidden');
    if (current === '/') break;
    current = dirname(current);
  }
}
function enrollment(configuration) {
  if (!keys(configuration, ['enrollmentDirectory','targetId','revision','digest']) || !Number.isSafeInteger(configuration.revision) || configuration.revision < 1 ||
    !/^[a-f0-9]{64}$/.test(configuration.digest)) fail('configuration_invalid');
  protectedPath(configuration.enrollmentDirectory, true, true);
  const path = join(configuration.enrollmentDirectory, 'enrollments.sqlite');
  for (const suffix of ['', '-wal', '-shm']) {
    try { protectedPath(path + suffix, false, true); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const db = new DatabaseSync(path, { readOnly: true, timeout: 5000 });
  let row;
  try {
    if (db.prepare('PRAGMA user_version').get().user_version !== 1) fail('configuration_invalid');
    row = db.prepare('SELECT e.payload,e.digest FROM enrollments e JOIN current_enrollments c ON c.target_id=e.target_id AND c.revision=e.revision WHERE e.target_id=? AND e.revision=?')
      .get(configuration.targetId, configuration.revision);
  } finally { db.close(); }
  if (!row || row.digest !== configuration.digest) fail('identity_mismatch');
  const e = JSON.parse(row.payload);
  if (hash(e) !== configuration.digest || !keys(e, ['schemaVersion','installationId','targetId','revision','host','port','user','hostKey','identityFile','helperCommand','rootIds','timeoutMs']) ||
    e.schemaVersion !== '1.0' || e.targetId !== configuration.targetId || e.revision !== configuration.revision ||
    !/^(?:[A-Za-z0-9][A-Za-z0-9.-]*|[0-9A-Fa-f]*:[0-9A-Fa-f:.]+)$/.test(e.host) || e.host.length > 253 ||
    !/^[a-z_][a-z0-9_-]{0,31}$/.test(e.user) || !Number.isInteger(e.port) || e.port < 1 || e.port > 65535 ||
    !/^ssh-ed25519 [A-Za-z0-9+/]{68}$/.test(e.hostKey) || !/^\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/.test(e.helperCommand) ||
    !Number.isInteger(e.timeoutMs) || e.timeoutMs < 100 || e.timeoutMs > 60000 ||
    !Array.isArray(e.rootIds) || !e.rootIds.length || e.rootIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_.:-]{1,256}$/.test(id))) fail('configuration_invalid');
  const blob = Buffer.from(e.hostKey.split(' ')[1], 'base64');
  if (blob.length !== 51 || blob.readUInt32BE(0) !== 11 || blob.subarray(4,15).toString() !== 'ssh-ed25519' || blob.readUInt32BE(15) !== 32) fail('configuration_invalid');
  protectedPath(e.identityFile, false, true);
  return e;
}
function checkRequest(e, request) {
  const common = ['schemaVersion','requestId','installationId','targetId','targetRevision','method'];
  const workspace = request?.schemaVersion === '2.0';
  const runtime = request?.schemaVersion === '3.0';
  if (!request || !(workspace || runtime ? ['probe','create','inspect'] : ['probe','reserve','inspect']).includes(request.method)) fail('unsupported_capability');
  if (!keys(request, request.method === 'probe' ? common : [...common, 'operation']) || !['1.0','2.0','3.0'].includes(request.schemaVersion) ||
    !/^[A-Za-z0-9_.:-]{1,256}$/.test(request.requestId) || request.installationId !== e.installationId ||
    request.targetId !== e.targetId || request.targetRevision !== e.revision) fail('identity_mismatch');
  if (request.method !== 'probe') {
    const op = request.operation;
    if (!op || op.operationId !== request.requestId || op.targetId !== e.targetId || op.actionId !== (runtime ? 'labstride.runtime-create' : workspace ? 'labstride.workspace-create' : 'labstride.target-reserve') || op.actionVersion !== '1.0.0' ||
      !keys(op.inputs, runtime ? ['target','rootId','workspaceOperationId','recipe'] : workspace ? ['target','rootId','source'] : ['rootId']) ||
      (workspace || runtime) && op.inputs.target !== op.targetId || workspace && hash(op.inputs.source) !== hash(op.source) ||
      runtime && (!/^[A-Za-z0-9_.:-]{1,256}$/.test(op.inputs.workspaceOperationId) || !keys(op.inputs.recipe,['id','version','digest']) || !/^[a-f0-9]{64}$/.test(op.inputs.recipe.digest)) || !e.rootIds.includes(op.inputs.rootId)) fail('validation_failed');
    const { requestDigest, ...contents } = op;
    if (hash(contents) !== requestDigest) fail('validation_failed');
  }
  const bytes = Buffer.from(JSON.stringify(request));
  if (bytes.length > 262144) fail('validation_failed');
  return bytes;
}
export function createExtension(configuration) {
  const config = structuredClone(configuration);
  return {
    validate(request) { const e = enrollment(config); checkRequest(e, request); },
    async invoke(request) {
      const e = enrollment(config), bytes = checkRequest(e, request);
      const directory = mkdtempSync(join(tmpdir(), 'labstride-ssh-'));
      try {
        protectedPath(directory, true, true);
        const knownHosts = join(directory, 'known_hosts'), alias = `labstride-${hash([e.installationId,e.targetId]).slice(0,40)}`;
        writeFileSync(knownHosts, `${alias} ${e.hostKey}\n`, { mode: 0o600, flag: 'wx' });
        const args = ['-F','/dev/null','-T','-p',String(e.port),'-l',e.user,
          '-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o',`UserKnownHostsFile=${knownHosts}`,
          '-o','GlobalKnownHostsFile=/dev/null','-o',`HostKeyAlias=${alias}`,'-o','UpdateHostKeys=no',
          '-o','VerifyHostKeyDNS=no','-o','IdentitiesOnly=yes','-o','IdentityAgent=none','-o','ForwardAgent=no',
          '-o','ClearAllForwardings=yes','-o','ControlMaster=no','-o','ControlPath=none','-o','PermitLocalCommand=no',
          '-o','ProxyCommand=none','-o','ProxyJump=none','-o','ConnectionAttempts=1','-o','ConnectTimeout=10',
          '-o','ServerAliveInterval=5','-o','ServerAliveCountMax=1','-i',e.identityFile,'--',e.host,e.helperCommand];
        const raw = await new Promise((resolve, reject) => {
          const child = spawn('/usr/bin/ssh', args, { cwd: '/', env: { PATH: '/usr/bin:/bin', LANG: 'C' }, stdio: ['pipe','pipe','pipe'] });
          const output = [], errors = []; let size = 0, errorSize = 0, exceeded = false;
          const timer = setTimeout(() => child.kill('SIGKILL'), e.timeoutMs);
          child.stdout.on('data', chunk => { size += chunk.length; if (size <= 262144) output.push(chunk); else { exceeded = true; child.kill('SIGKILL'); } });
          child.stderr.on('data', chunk => { errorSize += chunk.length; if (errorSize <= 16384) errors.push(chunk); else child.kill('SIGKILL'); });
          child.stdin.on('error', () => {});
          child.once('error', () => { clearTimeout(timer); reject(new Error('transient_unavailable')); });
          child.once('close', code => {
            clearTimeout(timer);
            if (code === 0 && !exceeded) { resolve(Buffer.concat(output).toString('utf8')); return; }
            const stderr = Buffer.concat(errors).toString('utf8');
            reject(new Error(/Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/.test(stderr) ? 'identity_mismatch' :
              /Permission denied/.test(stderr) ? 'authentication_failed' : ['reserve','create'].includes(request.method) ? 'outcome_unknown' : 'transient_unavailable'));
          });
          child.stdin.end(bytes);
        });
        let reply;
        try { reply = JSON.parse(raw); } catch { fail(['reserve','create'].includes(request.method) ? 'outcome_unknown' : 'validation_failed'); }
        for (const key of ['schemaVersion','requestId','installationId','targetId','targetRevision','method'])
          if (reply[key] !== request[key]) fail('identity_mismatch');
        return reply;
      } finally { rmSync(directory, { recursive: true }); }
    },
  };
}
