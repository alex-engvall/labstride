// Separate durable effect receiver. Every start call is counted, including duplicate IDs.
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
const db = new DatabaseSync(process.argv[2]);
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS calls (id INTEGER PRIMARY KEY, operation_id TEXT); CREATE TABLE IF NOT EXISTS results (operation_id TEXT PRIMARY KEY, payload TEXT); CREATE TABLE IF NOT EXISTS cancels (operation_id TEXT);');
const server = createServer(async (req, res) => {
  let text = ''; for await (const chunk of req) text += chunk;
  const operation = JSON.parse(text);
  let row = db.prepare('SELECT payload FROM results WHERE operation_id=?').get(operation.operationId);
  if (req.url === '/start') {
    db.exec('BEGIN IMMEDIATE');
    db.prepare('INSERT INTO calls(operation_id) VALUES (?)').run(operation.operationId);
    const bound = { schemaVersion: '1.0', kind: 'result', operationId: operation.operationId, requestDigest: operation.requestDigest,
      result: { status: req.headers['x-pending'] ? 'accepted' : 'succeeded', handle: `handle:${operation.operationId}`, resources: [{ type: 'synthetic', id: `owned:${operation.operationId}`, state: 'ready' }],
        outputs: {}, evidenceRefs: [`target:${operation.operationId}`], error: null } };
    db.prepare('INSERT OR IGNORE INTO results VALUES (?,?)').run(operation.operationId, JSON.stringify(bound));
    db.exec('COMMIT'); row = db.prepare('SELECT payload FROM results WHERE operation_id=?').get(operation.operationId);
    process.send({ stage: 'effect', operationId: operation.operationId });
    if (req.headers['x-drop-reply']) { req.socket.destroy(); return; }
  }
  if (req.url === '/cancel' && row) {
    db.prepare('INSERT INTO cancels VALUES (?)').run(operation.operationId);
    const result = JSON.parse(row.payload);
    if (result.result.status === 'accepted') result.result.status = 'cancelled';
    db.prepare('UPDATE results SET payload=? WHERE operation_id=?').run(JSON.stringify(result),operation.operationId);
    row = { payload: JSON.stringify(result) };
    if (req.headers['x-drop-reply']) { req.socket.destroy(); return; }
  }
  if (!row) {
    res.end(JSON.stringify({ schemaVersion: '1.0', kind: 'result', operationId: operation.operationId, requestDigest: operation.requestDigest,
      result: { status: 'outcome_unknown', handle: null, resources: [], outputs: {}, evidenceRefs: [],
        error: { code: 'outcome_unknown', message: 'No conclusive target evidence', evidenceId: null, retryClass: 'reconcile' } } }));
  } else res.end(row.payload);
});
server.listen(0, '127.0.0.1', () => process.send({ stage: 'ready', url: `http://127.0.0.1:${server.address().port}` }));
