import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { startCoordinator } from '../apps/coordinator/main.ts';
import { migrate, migrations } from '../packages/storage-sqlite/migrations.ts';
import { changes, context, fixtureRecords, update } from './helpers/lifecycle-fixture.mjs';

const runId = 'run-example-001', workspaceId = 'ws-example-001', operationId = 'op-example-001';
const fail = code => error => error.code === code;
function directory(t) {
  const root = mkdtempSync(join(tmpdir(), 'labstride-lifecycle-'));
  t.after(() => rmSync(root, { recursive: true, force: true })); return root;
}
function fixture(t) {
  const dataDir = directory(t);
  const runtime = startCoordinator(dataDir);
  t.after(() => runtime.store.close());
  runtime.store.commit(changes(fixtureRecords()), context);
  return { ...runtime, dataDir };
}
function child(t, mode, dataDir) {
  const process = fork(new URL('./helpers/lifecycle-process.mjs', import.meta.url), [mode, dataDir], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  t.after(() => { if (process.exitCode === null && process.signalCode === null) process.kill('SIGKILL'); });
  return process;
}
async function message(process) {
  const [value] = await once(process, 'message', { signal: AbortSignal.timeout(10000) }); return value;
}

test('independent facts, pause checkpoint, session identity, intents and audit survive actual app restart', t => {
  const { store, dataDir } = fixture(t);
  update(store, 'run', runId, { state: 'preparing', checkpoint: 'workspace-observation', paused: true });
  update(store, 'workspace', workspaceId, { state: 'creating' });
  update(store, 'workspace', workspaceId, { state: 'ready' });
  update(store, 'deployment', 'deployment-test', { state: 'running' });
  update(store, 'session', 'session-enrollment-test', { state: 'busy', lastTurnId: 'opaque/turn/2', humanActivityRevision: 8 });
  const expected = store.snapshot();
  const result = spawnSync(process.execPath, [new URL('../apps/coordinator/main.ts', import.meta.url).pathname, dataDir], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.notEqual(result.stdout, '', JSON.stringify(result));
  assert.deepEqual(JSON.parse(result.stdout), expected);
  assert.equal(store.history(runId).audit.length, 14);
});

for (const mode of ['before', 'after']) test(`SIGKILL ${mode} commit uses real coordinator and recovers atomic facts`, async t => {
  const dataDir = directory(t);
  const process = child(t, mode, dataDir);
  assert.equal((await message(process)).stage, `${mode}_commit`);
  const exited = once(process, 'exit'); process.kill('SIGKILL');
  assert.equal((await exited)[1], 'SIGKILL');
  const { store, recovered } = startCoordinator(dataDir); t.after(() => store.close());
  if (mode === 'before') {
    assert.deepEqual(recovered.records, []);
    const db = new DatabaseSync(join(dataDir, 'state.sqlite'));
    assert.equal(db.prepare('SELECT count(*) AS n FROM audit').get().n, 0); db.close();
  } else {
    assert.equal(recovered.records.length, fixtureRecords().length);
    assert.equal(recovered.pendingIntents.length, 1);
    assert.equal(recovered.pendingIntents[0].operationId, operationId);
    assert.equal(store.get('session', 'session-enrollment-test').sessionId, 'opaque/session/1');
    assert.equal(store.history(runId).audit.length, fixtureRecords().length);
  }
});

test('two real processes with the same revision produce one commit and one conflict', async t => {
  const { store, dataDir } = fixture(t);
  const children = [child(t, 'revision', dataDir), child(t, 'revision', dataDir)];
  const ready = await Promise.all(children.map(message));
  assert.ok(ready.every(m => m.stage === 'ready'));
  const results = children.map(message);
  const exits = children.map(p => once(p, 'exit'));
  children.forEach(p => p.send('go'));
  assert.deepEqual((await Promise.all(results)).map(m => m.result).sort(), ['ok', 'revision_conflict']);
  await Promise.all(exits);
  assert.equal(store.get('run', runId).revision, 2);
  assert.equal(store.history(runId).audit.filter(a => a.record.kind === 'run').length, 2);
});

test('invalid lifecycle edges, identities, generations and references leave no partial writes', t => {
  const { store } = fixture(t);
  const before = store.history(runId);
  assert.throws(() => update(store, 'run', runId, { state: 'completed' }), fail('invalid_transition'));
  assert.throws(() => update(store, 'session', 'session-enrollment-test', { humanActivityRevision: 6 }), fail('revision_conflict'));
  assert.throws(() => update(store, 'workspace', workspaceId, { ownershipRef: 'substituted' }), fail('identity_conflict'));
  const records = fixtureRecords();
  const second = { ...records[1], id: 'second-request' };
  assert.throws(() => store.commit(changes([second]), context), fail('identity_conflict'));
  const orphan = { ...records[3], id: 'orphan-workspace', runId: 'missing-run' };
  const run = store.get('run', runId);
  assert.throws(() => store.commit([{ record: { ...run, revision: 2, state: 'preparing' }, expectedRevision: 1 }, ...changes([orphan])], context), fail('identity_conflict'));
  assert.deepEqual(store.history(runId), before);
});

test('schema versions, formats, bounds and extra fields fail before persistence', t => {
  const { store } = fixture(t);
  const run = store.get('run', runId);
  for (const fields of [{ schemaVersion: '2.0' }, { updatedAt: 'not-a-date' }, { unauthorized: true },
    { revision: 9007199254740992 }, { checkpoint: 'x'.repeat(300000) }]) {
    assert.throws(() => store.commit([{ record: { ...run, revision: 2, ...fields }, expectedRevision: 1 }], context), fail('invalid_payload'));
  }
  assert.equal(store.get('run', runId).revision, 1);
});

test('operation and original intent are inseparable; uncertain results survive restart and require reconciliation', t => {
  const { store, dataDir } = fixture(t);
  update(store, 'operation', operationId, { state: 'claimed' });
  update(store, 'operation', operationId, { state: 'running', effectBoundary: 'crossed' });
  update(store, 'operation', operationId, { state: 'outcome_unknown' });
  const next = startCoordinator(dataDir); t.after(() => next.store.close());
  assert.equal(next.store.get('operation', operationId).state, 'outcome_unknown');
  assert.equal(next.recovered.pendingIntents.length, 0);
  assert.equal(next.recovered.reconciliationRequired[0].id, operationId);
  assert.throws(() => update(store, 'operation', operationId, { state: 'running' }), fail('recovery_required'));
  assert.throws(() => update(store, 'operation', operationId, { state: 'running' }, true, { ...context, evidenceRefs: [] }), fail('recovery_required'));
  update(store, 'operation', operationId, { state: 'succeeded' }, true);
  assert.throws(() => update(store, 'operation', operationId, { state: 'failed' }), fail('invalid_transition'));
  const op = { ...fixtureRecords()[4], id: 'new-op' };
  op.request = { ...op.request, operationId: op.id };
  assert.throws(() => store.commit(changes([op]), context), fail('identity_conflict'));
  assert.throws(() => store.get('operation', op.id), fail('not_found'));
});

test('foreign keys and append-only audit are enforced by SQLite, including direct writes', t => {
  const { dataDir } = fixture(t);
  const db = new DatabaseSync(join(dataDir, 'state.sqlite')); t.after(() => db.close());
  db.exec('PRAGMA foreign_keys=ON');
  assert.throws(() => db.prepare('DELETE FROM runs WHERE id=?').run(runId), /FOREIGN KEY/);
  assert.throws(() => db.exec('DELETE FROM audit'), /immutable_audit/);
  assert.throws(() => db.exec("UPDATE audit SET payload='{}'"), /immutable_audit/);
});

test('migration failure rolls back DDL and version; unknown or altered schemas are rejected', t => {
  const dataDir = directory(t);
  const db = new DatabaseSync(join(dataDir, 'state.sqlite')); t.after(() => db.close());
  migrate(db);
  assert.throws(() => migrate(db, [...migrations, { version: migrations.length + 1, sql: 'CREATE TABLE partial_upgrade (id TEXT); INVALID SQL;' }]), fail('migration_failed'));
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, migrations.length);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='partial_upgrade'").get(), undefined);
  assert.throws(() => migrate(db, [{ version: 1, sql: migrations[0].sql + '-- modified' }, ...migrations.slice(1)]), fail('unsupported_schema'));
  db.exec('PRAGMA user_version=99');
  assert.throws(() => startCoordinator(dataDir), fail('unsupported_schema'));
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 99);
});
