// Public, independently authored adapter for an existing Codex app-server 0.163.0.
import { connect } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export class UnixRpc {
  constructor(path, timeoutMs = 5000) {
    this.path = path; this.timeoutMs = timeoutMs; this.sequence = 0; this.pending = new Map();
    this.socket = null; this.connecting = null; this.onNotification = () => {}; this.onDisconnect = () => {};
  }
  async open() {
    if (this.socket && !this.socket.destroyed) return;
    if (this.connecting) return this.connecting;
    this.connecting = new Promise((resolve, reject) => {
      const socket = connect({ path: this.path });
      const key = randomBytes(16).toString('base64');
      let bytes = Buffer.alloc(0), upgraded = false, settled = false, failed = false, fragments = [], fragmentBytes = 0;
      const fail = () => {
        if (failed) return; failed = true;
        socket.destroy(); this.socket = null; this.onDisconnect();
        for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('outcome_unknown')); }
        this.pending.clear();
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error('transient_unavailable')); }
      };
      const timer = setTimeout(fail, this.timeoutMs);
      socket.on('error', fail); socket.on('close', fail);
      socket.on('connect', () => socket.write(`GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${key}\r\n\r\n`));
      const message = payload => {
        if (payload.length > 262144) throw new Error();
        const text = new TextDecoder('utf-8', { fatal: true }).decode(payload), value = JSON.parse(text);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        if (Object.hasOwn(value, 'id') && !Object.hasOwn(value, 'method')) {
          const pending = this.pending.get(value.id);
          if (!pending) return; // Late response to a timed-out command has no new authority.
          this.pending.delete(value.id); clearTimeout(pending.timer);
          if (value.error) {
            // Keep the conservative public error code. Bounded protocol detail
            // permits an opt-in caller to recognize one exact read rejection;
            // unknown failures still never authorize another mutation.
            const error = new Error('rpc_rejected');
            if (Number.isSafeInteger(value.error.code) && typeof value.error.message === 'string' && value.error.message.length <= 4096)
              error.rpcError = { code: value.error.code, message: value.error.message };
            pending.reject(error);
          }
          else if (!Object.hasOwn(value, 'result')) pending.reject(new Error('invalid_payload'));
          else pending.resolve(value.result);
        } else this.onNotification(value);
      };
      socket.on('data', chunk => {
        try {
          bytes = Buffer.concat([bytes, chunk]);
          if (!upgraded) {
            const end = bytes.indexOf('\r\n\r\n');
            if (end === -1) { if (bytes.length > 8192) throw new Error(); return; }
            if (end > 8192) throw new Error();
            const lines = bytes.subarray(0, end).toString('ascii').split('\r\n'), headers = new Map();
            if (!/^HTTP\/1\.1 101(?: |$)/.test(lines.shift())) throw new Error();
            for (const line of lines) {
              const colon = line.indexOf(':'); if (colon < 1) throw new Error();
              const name = line.slice(0, colon).toLowerCase(); if (headers.has(name)) throw new Error();
              headers.set(name, line.slice(colon + 1).trim());
            }
            if (headers.get('sec-websocket-accept') !== createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64') ||
              headers.get('upgrade')?.toLowerCase() !== 'websocket' || !headers.get('connection')?.toLowerCase().split(/\s*,\s*/).includes('upgrade')) throw new Error();
            bytes = bytes.subarray(end + 4); upgraded = true; this.socket = socket; settled = true; clearTimeout(timer); resolve();
          }
          while (bytes.length >= 2) {
            const first = bytes[0], second = bytes[1], opcode = first & 15, fin = !!(first & 128);
            if (first & 112 || second & 128 || ![0,1,8,9,10].includes(opcode)) throw new Error();
            let length = second & 127, offset = 2;
            if (length === 126) { if (bytes.length < 4) return; length = bytes.readUInt16BE(2); offset = 4; if (length < 126) throw new Error(); }
            else if (length === 127) {
              if (bytes.length < 10) return;
              const big = bytes.readBigUInt64BE(2); if (big > 262144n || big < 65536n) throw new Error(); length = Number(big); offset = 10;
            }
            if (length > 262144 || (opcode >= 8 && (!fin || length > 125))) throw new Error();
            if (bytes.length < offset + length) return;
            const payload = bytes.subarray(offset, offset + length); bytes = bytes.subarray(offset + length);
            if (opcode === 8) { fail(); return; }
            if (opcode === 9) { this.frame(10, payload); continue; }
            if (opcode === 10) continue;
            if ((opcode === 0 && !fragments.length) || (opcode === 1 && fragments.length)) throw new Error();
            fragments.push(payload); fragmentBytes += payload.length;
            if (fragmentBytes > 262144) throw new Error();
            if (fin) { message(Buffer.concat(fragments)); fragments = []; fragmentBytes = 0; }
          }
          if (bytes.length > 262154) throw new Error();
        } catch { fail(); }
      });
    });
    try { await this.connecting; } finally { this.connecting = null; }
  }
  frame(opcode, payload) {
    const mask = randomBytes(4), size = payload.length, header = Buffer.alloc(size < 126 ? 2 : size <= 65535 ? 4 : 10);
    header[0] = 128 | opcode;
    if (size < 126) header[1] = 128 | size;
    else if (size <= 65535) { header[1] = 254; header.writeUInt16BE(size, 2); }
    else { header[1] = 255; header.writeBigUInt64BE(BigInt(size), 2); }
    const masked = Buffer.from(payload); for (let i = 0; i < size; i++) masked[i] ^= mask[i % 4];
    if (!this.socket || this.socket.destroyed) throw new Error('transient_unavailable');
    this.socket.write(Buffer.concat([header, mask, masked]));
  }
  async call(method, params) {
    await this.open();
    const id = ++this.sequence, payload = Buffer.from(JSON.stringify({ id, method, params }));
    if (payload.length > 262144 || this.pending.size >= 64) throw new Error('invalid_payload');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('outcome_unknown')); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.frame(1, payload); } catch { clearTimeout(timer); this.pending.delete(id); reject(new Error('outcome_unknown')); }
    });
  }
  notify(method, params) { this.frame(1, Buffer.from(JSON.stringify({ method, params }))); }
  close() { this.socket?.destroy(); }
}

export function createExtension(config) {
  if (![config.databasePath, config.socketPath, config.workspacePath].every(isAbsolute)) throw new Error('configuration_invalid');
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try { if (!lstatSync(config.databasePath + suffix).isFile()) throw new Error('unsafe_backend_path'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const db = new DatabaseSync(config.databasePath);
  const owner = JSON.stringify([config.providerId, config.backendIdentity, config.sessionId, config.workspaceId, config.workspacePath]);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  if (tables.length && (!tables.some(t => t.name === 'labstride_owner') ||
    db.prepare('SELECT owner FROM labstride_owner').get()?.owner !== owner)) { db.close(); throw new Error('unsafe_backend_path'); }
  db.exec('CREATE TABLE IF NOT EXISTS labstride_owner (owner TEXT PRIMARY KEY)');
  db.prepare('INSERT OR IGNORE INTO labstride_owner VALUES (?)').run(owner);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS observations (session_id TEXT PRIMARY KEY, turn_id TEXT, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS question_events (id TEXT PRIMARY KEY, payload TEXT NOT NULL);`);
  const rpc = new UnixRpc(config.socketPath, config.timeoutMs ?? 5000);
  let initialized = false, initialization = null;
  const questions = new Map();
  rpc.onDisconnect = () => { initialized = false; questions.clear(); };
  rpc.onNotification = value => {
    const p = value.params;
    if (!p || p.threadId !== config.sessionId) return;
    if (value.method === 'item/tool/requestUserInput') {
      if (!((typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 1024) || Number.isSafeInteger(value.id)) ||
        typeof p.turnId !== 'string' || !p.turnId || p.turnId.length > 1024 || typeof p.itemId !== 'string' || !p.itemId || p.itemId.length > 1024 ||
        !Array.isArray(p.questions) || !p.questions.length || p.questions.length > 32 || p.questions.some(q => typeof q.id !== 'string' || !q.id || q.id.length > 1024) ||
        new Set(p.questions.map(q => q.id)).size !== p.questions.length) return;
      if (questions.size >= 32) return;
      const question = { schemaVersion: '1.0', sessionId: p.threadId, turnId: p.turnId, requestId: value.id,
        itemId: p.itemId, questionIds: p.questions.map(q => q.id), status: 'pending' };
      const key = JSON.stringify([config.sessionId,p.turnId,value.id,'pending']), serialized = JSON.stringify(question);
      const old = db.prepare('SELECT payload FROM question_events WHERE id=?').get(key);
      if (old && old.payload !== serialized) { questions.delete(value.id); return; }
      db.prepare('INSERT OR IGNORE INTO question_events VALUES (?,?)').run(key, serialized);
      questions.set(value.id, question);
    } else if (value.method === 'serverRequest/resolved') {
      const question = questions.get(p.requestId);
      if (question) db.prepare('INSERT OR IGNORE INTO question_events VALUES (?,?)')
        .run(JSON.stringify([config.sessionId,question.turnId,p.requestId,'resolved']), JSON.stringify({ ...question, status: 'resolved' }));
      questions.delete(p.requestId);
    }
    // No hook, tool, permission or completion notification creates human authority.
  };
  async function ready() {
    if (initialized) return;
    if (!initialization) initialization = (async () => {
      const result = await rpc.call('initialize', { clientInfo: { name: 'labstride-session-example', version: '0.1.0' }, capabilities: { experimentalApi: true } });
      if (typeof result.userAgent !== 'string' || !/(?:^|[ /])0\.163\.0(?:[ /]|$)/.test(result.userAgent)) throw new Error('unsupported_capability');
      rpc.notify('initialized', {}); initialized = true;
    })().finally(() => { initialization = null; });
    await initialization;
  }
  const failure = code => ({ schemaVersion: '1.0', outcome: 'error', code, evidenceRefs: [`codex:${code}`] });
  async function validate(request) {
    if (request.providerId !== config.providerId || request.workspaceId !== config.workspaceId ||
      (request.command !== 'start' && request.sessionId !== config.sessionId) || Object.keys(request.input).length)
      throw new Error('identity_mismatch');
    await ready();
  }
  async function observe() {
    await ready();
    const { thread } = await rpc.call('thread/read', { threadId: config.sessionId, includeTurns: false });
    if (!thread || thread.id !== config.sessionId || thread.cwd !== config.workspacePath || thread.source?.subAgent) throw new Error('identity_mismatch');
    // Page only bounded turn metadata; never read local rollout/transcript files.
    const history = await rpc.call('thread/turns/list', { threadId: config.sessionId, limit: 1, sortDirection: 'desc', itemsView: 'summary' });
    if (!Array.isArray(history.data) || history.data.length > 1) throw new Error('history_unavailable');
    const last = history.data[0];
    if (last && (typeof last.id !== 'string' || !['completed','interrupted','failed','inProgress'].includes(last.status))) throw new Error('history_unavailable');
    const lastTurnId = last?.id ?? null;
    for (const [id, question] of questions) if (question.turnId !== lastTurnId) questions.delete(id);
    // This revision is explicitly only a local observation token. No atomic backend guard is advertised.
    db.exec('BEGIN IMMEDIATE');
    let revision;
    try {
      const old = db.prepare('SELECT * FROM observations WHERE session_id=?').get(config.sessionId);
      revision = old ? old.revision + (old.turn_id === lastTurnId ? 0 : 1) : lastTurnId === null ? 0 : 1;
      db.prepare('INSERT INTO observations VALUES (?,?,?) ON CONFLICT(session_id) DO UPDATE SET turn_id=excluded.turn_id,revision=excluded.revision')
        .run(config.sessionId,lastTurnId,revision);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    const state = thread.status?.type === 'active' || last?.status === 'inProgress' ? 'busy' :
      thread.status?.type === 'idle' ? 'ready' : 'outcome_unknown';
    return { schemaVersion: '1.0', workspaceId: config.workspaceId, providerId: config.providerId, sessionId: config.sessionId,
      state: questions.size ? 'waiting_human' : state, lastTurnId, humanActivityRevision: revision,
      effectiveSettings: { atomicGuards: false, hooks: false, pendingQuestions: [...questions.values()], questionRecovery: 'backend_reconciliation_required' },
      evidenceRefs: [`codex:thread:${config.sessionId}`, 'codex:backend-observed'] };
  }
  return {
    backendIdentity: config.backendIdentity, atomicSessionGuards: false, hooks: false, validate,
    async invoke(request) {
      await validate(request);
      const observed = await observe();
      if (['send','interrupt'].includes(request.command) && (request.expectedLastTurnId !== observed.lastTurnId ||
        request.expectedHumanActivityRevision !== observed.humanActivityRevision)) return failure('stale_revision');
      if (request.command === 'send') return failure('unsupported_capability');
      if (request.command === 'resume') {
        await rpc.call('thread/resume', { threadId: config.sessionId, excludeTurns: true });
        return { schemaVersion: '1.0', outcome: 'ok', observation: await observe() };
      }
      if (request.command === 'interrupt') {
        if (!observed.lastTurnId || observed.state !== 'busy') return failure('stale_revision');
        await rpc.call('turn/interrupt', { threadId: config.sessionId, turnId: observed.lastTurnId });
        return { schemaVersion: '1.0', outcome: 'ok', observation: await observe() };
      }
      if (request.command === 'close') {
        await rpc.call('thread/unsubscribe', { threadId: config.sessionId });
        rpc.close();
      }
      return { schemaVersion: '1.0', outcome: 'ok', observation: observed };
    },
    async reconcile(request) {
      await validate(request);
      if (request.command === 'start' || request.command === 'observe' || request.command === 'resume') return { schemaVersion: '1.0', outcome: 'ok', observation: await observe() };
      // A current state is not a receipt proving a particular send, interrupt or detach happened.
      return { schemaVersion: '1.0', outcome: 'outcome_unknown', evidenceRefs: ['codex:command-receipt-unavailable'] };
    },
    dispose() { rpc.onNotification = () => {}; rpc.close(); db.close(); },
  };
}
