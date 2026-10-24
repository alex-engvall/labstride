// Independent target process. GET reads durable release/health state; it never
// receives the coordinator's expected source SHA or receipt.
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
const db = new DatabaseSync(process.argv[2]);
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS release (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT); CREATE TABLE IF NOT EXISTS effects (operation_id TEXT);');
let patch = {}, responseMode = 'normal';
process.on('message', message => {
  patch = message.patch ?? {}; responseMode = message.responseMode ?? 'normal';
  process.send({ configured: true });
});
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'POST' && url.pathname === '/deploy') {
    let body = ''; for await (const chunk of req) body += chunk;
    const { operationId, ...state } = JSON.parse(body);
    db.exec('BEGIN IMMEDIATE');
    db.prepare('INSERT INTO effects VALUES (?)').run(operationId);
    db.prepare('INSERT INTO release VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(JSON.stringify(state));
    db.exec('COMMIT'); res.end('{}'); return;
  }
  if (req.method !== 'GET' || url.pathname !== '/state') { res.writeHead(404); res.end(); return; }
  if (responseMode === 'unavailable') { res.writeHead(503); res.end(); return; }
  if (responseMode === 'malformed') { res.end('{'); return; }
  if (responseMode === 'oversized') { res.end('x'.repeat(262145)); return; }
  if (responseMode === 'redirect') { res.writeHead(302, { location: '/other' }); res.end(); return; }
  const row = db.prepare('SELECT payload FROM release WHERE id=1').get();
  if (!row) { res.writeHead(404); res.end(); return; }
  const state = JSON.parse(row.payload);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ schemaVersion: '1.0', observationId: url.searchParams.get('observationId'), ...state, ...patch }));
});
server.listen(0, '127.0.0.1', () => process.send({ url: `http://127.0.0.1:${server.address().port}` }));
