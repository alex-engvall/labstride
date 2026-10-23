// Public synthetic backend. Its independent durable ledger supplies atomic guards and command receipts.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';
export function createExtension(config) {
  if (!isAbsolute(config.databasePath)) throw new Error('unsafe_backend_path');
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try { if (!lstatSync(config.databasePath + suffix).isFile()) throw new Error('unsafe_backend_path'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const db = new DatabaseSync(config.databasePath);
  const owner = JSON.stringify([config.providerId, config.backendIdentity]);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  if (tables.length && (!tables.some(t => t.name === 'labstride_owner') ||
    db.prepare('SELECT owner FROM labstride_owner').get()?.owner !== owner)) { db.close(); throw new Error('unsafe_backend_path'); }
  db.exec('CREATE TABLE IF NOT EXISTS labstride_owner (owner TEXT PRIMARY KEY)');
  db.prepare('INSERT OR IGNORE INTO labstride_owner VALUES (?)').run(owner);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, workspace TEXT, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, request TEXT NOT NULL, reply TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS effects (id TEXT PRIMARY KEY, command TEXT NOT NULL);`);
  const read = id => { const row = db.prepare('SELECT payload FROM sessions WHERE id=?').get(id); return row && JSON.parse(row.payload); };
  const error = code => ({ schemaVersion: '1.0', outcome: 'error', code, evidenceRefs: [`fixture:${code}`] });
  function validate(request) {
    if (request.providerId !== config.providerId || Object.keys(request.input).length) throw new Error('validation_failed');
  }
  return {
    backendIdentity: config.backendIdentity, atomicSessionGuards: true, hooks: true, validate,
    async invoke(request) {
      validate(request);
      db.exec('BEGIN IMMEDIATE');
      try {
        const serialized = JSON.stringify(request), old = db.prepare('SELECT * FROM commands WHERE id=?').get(request.operationId);
        if (old) { if (old.request !== serialized) throw new Error('identity_mismatch'); db.exec('COMMIT'); return JSON.parse(old.reply); }
        let session = read(request.sessionId), reply;
        if (request.command === 'start') {
          const id = `fixture-${createHash('sha256').update(request.operationId).digest('hex')}`;
          session = { schemaVersion: '1.0', workspaceId: request.workspaceId, providerId: config.providerId, sessionId: id,
            state: 'ready', lastTurnId: null, humanActivityRevision: 0, effectiveSettings: {}, evidenceRefs: [`fixture:session:${id}`] };
          db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(id, request.workspaceId, JSON.stringify(session));
        } else if (!session || session.workspaceId !== request.workspaceId) reply = error('identity_mismatch');
        else if (['send','interrupt'].includes(request.command) && (session.lastTurnId !== request.expectedLastTurnId ||
          session.humanActivityRevision !== request.expectedHumanActivityRevision)) reply = error('stale_revision');
        else if (request.command === 'send') {
          if (session.state !== 'ready') reply = error('stale_revision');
          else { session.lastTurnId = `turn:${request.operationId}`; session.state = 'busy'; }
        } else if (request.command === 'interrupt') session.state = 'ready';
        else if (request.command === 'close') session.state = 'closed';
        if (!reply) {
          db.prepare('UPDATE sessions SET payload=? WHERE id=?').run(JSON.stringify(session), session.sessionId);
          reply = { schemaVersion: '1.0', outcome: 'ok', observation: session };
          if (!['observe','resume'].includes(request.command)) db.prepare('INSERT INTO effects VALUES (?,?)').run(request.operationId, request.command);
        }
        db.prepare('INSERT INTO commands VALUES (?,?,?)').run(request.operationId, serialized, JSON.stringify(reply));
        db.exec('COMMIT'); return reply;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    async reconcile(request) {
      const row = db.prepare('SELECT * FROM commands WHERE id=?').get(request.operationId);
      if (!row) return { schemaVersion: '1.0', outcome: 'outcome_unknown', evidenceRefs: ['fixture:no-command-receipt'] };
      if (row.request !== JSON.stringify(request)) return error('identity_mismatch');
      return JSON.parse(row.reply);
    },
    dispose() { db.close(); },
  };
}
