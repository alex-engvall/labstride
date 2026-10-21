import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startCoordinator } from '../apps/coordinator/main.ts';
import { migrate, migrations } from '../packages/storage-sqlite/migrations.ts';
import { changes, context, fixtureRecords, record, timestamp, update } from './helpers/lifecycle-fixture.mjs';

const runId = 'run-example-001', workspaceId = 'ws-example-001', operationId = 'op-example-001';
const fail = code => error => error.code === code;
function directory(t) {
  const root = mkdtempSync(join(tmpdir(), 'labstride-retention-'));
  t.after(() => rmSync(root, { recursive: true, force: true })); return root;
}
function evidence(category, id = `${category}-evidence`, fields = {}) {
  return record('evidence', id, { runId, workspaceId, operationId, category, subjectId: `${category}-test`,
    sourceSha: 'a'.repeat(40), targetId: 'application-test', outcome: 'verified', reference: `test:${category}`,
    tombstoneRef: category === 'cleanup' ? 'target:test-tombstone' : null, correctsId: null, ...fields });
}
function resource(fields = {}) {
  return record('resource', 'directory-resource', { runId, workspaceId, createdByOperation: operationId,
    resourceType: 'directory', providerId: 'test-target', locator: 'test:workspace', ownershipRef: 'test:ownership',
    cleanupPolicy: 'test-owned-directory', ...fields });
}

test('actual owned workspace removal preserves resource/run/merge/deploy/cleanup evidence and a sibling directory', t => {
  const root = directory(t);
  const workspace = join(root, 'workspace'), state = join(root, 'state'), sibling = join(root, 'unrelated');
  mkdirSync(workspace); mkdirSync(sibling);
  writeFileSync(join(workspace, 'owned-test-marker'), 'test:ownership');
  writeFileSync(join(sibling, 'keep'), 'unrelated-work');
  const runtime = startCoordinator(state, { localWorkspaceRoots: [workspace] }); t.after(() => runtime.store.close());
  const records = fixtureRecords(); records.find(r => r.kind === 'workspace').localPath = workspace;
  runtime.store.commit(changes(records), context);
  runtime.store.commit(changes([resource(), evidence('pr'), evidence('merge'), evidence('deployment')]), context);
  update(runtime.store, 'workspace', workspaceId, { state: 'creating' });
  update(runtime.store, 'workspace', workspaceId, { state: 'ready' });
  update(runtime.store, 'workspace', workspaceId, { state: 'cleanup_pending', keep: false });
  update(runtime.store, 'workspace', workspaceId, { state: 'deleting' });
  // This fixture owns the entire temporary root. No product deletion helper/action is being asserted.
  assert.equal(readFileSync(join(workspace, 'owned-test-marker'), 'utf8'), 'test:ownership');
  const tombstone = join(root, 'test-target-tombstone.json');
  writeFileSync(tombstone, JSON.stringify({ schemaVersion: '1.0', workspaceId, operationId, ownershipRef: 'test:ownership' }));
  rmSync(workspace, { recursive: true });
  const current = runtime.store.get('workspace', workspaceId);
  runtime.store.commit([...changes([evidence('cleanup')]), { record: { ...current, state: 'deleted', revision: current.revision + 1 }, expectedRevision: current.revision }], context);
  const next = startCoordinator(state); t.after(() => next.store.close());
  const history = next.store.history(runId);
  assert.equal(next.store.get('workspace', workspaceId).state, 'deleted');
  assert.deepEqual(history.records.filter(r => r.kind === 'evidence').map(r => r.category).sort(), ['cleanup', 'deployment', 'merge', 'pr']);
  assert.ok(history.records.some(r => r.kind === 'run'));
  assert.ok(history.records.some(r => r.kind === 'deployment'));
  assert.ok(history.records.some(r => r.kind === 'resource'));
  assert.equal(next.store.get('evidence', 'cleanup-evidence').tombstoneRef, 'target:test-tombstone');
  assert.equal(history.audit.filter(a => a.record.kind === 'evidence').length, 4);
  assert.equal(readFileSync(join(sibling, 'keep'), 'utf8'), 'unrelated-work');
  assert.equal(JSON.parse(readFileSync(tombstone, 'utf8')).workspaceId, workspaceId);
  assert.equal(existsSync(workspace), false);
});

test('terminal evidence is immutable; corrections append a same-workspace record and audit', t => {
  const root = directory(t), { store } = startCoordinator(join(root, 'state')); t.after(() => store.close());
  store.commit(changes(fixtureRecords()), context);
  store.commit(changes([resource()]), context);
  store.commit(changes([evidence('deployment')]), context);
  assert.throws(() => update(store, 'resource', 'directory-resource', { locator: 'substituted' }), fail('invalid_transition'));
  assert.throws(() => update(store, 'evidence', 'deployment-evidence', { outcome: 'failed' }), fail('invalid_transition'));
  const correction = evidence('correction', 'correction-evidence', { correctsId: 'deployment-evidence', subjectId: 'deployment-test', outcome: 'failed' });
  store.commit(changes([correction]), context);
  assert.equal(store.get('evidence', 'deployment-evidence').outcome, 'verified');
  assert.equal(store.get('evidence', correction.id).correctsId, 'deployment-evidence');
  const db = new DatabaseSync(join(root, 'state/state.sqlite')); t.after(() => db.close());
  assert.throws(() => db.exec('DELETE FROM evidence'), /immutable_evidence/);
  assert.throws(() => db.exec("UPDATE evidence SET payload='{}'"), /immutable_evidence/);
  assert.throws(() => db.exec('DELETE FROM resources'), /immutable_resource/);
  assert.throws(() => db.exec("UPDATE resources SET payload='{}'"), /immutable_resource/);
  db.exec('PRAGMA foreign_keys=ON');
  assert.throws(() => db.prepare('DELETE FROM workspaces WHERE id=?').run(workspaceId), /FOREIGN KEY/);
});

test('resource ownership, evidence identities, missing tombstones and correction references fail atomically', t => {
  const root = directory(t), { store } = startCoordinator(join(root, 'state')); t.after(() => store.close());
  store.commit(changes(fixtureRecords()), context);
  for (const [value, code] of [[resource({ ownershipRef: 'foreign' }), 'identity_conflict'],
    [evidence('merge', 'foreign-sha', { sourceSha: 'b'.repeat(40) }), 'identity_conflict'],
    [evidence('cleanup', 'no-tombstone', { tombstoneRef: null }), 'invalid_payload'],
    [evidence('correction', 'missing-original', { correctsId: 'missing-evidence' }), 'not_found']]) {
    const before = store.history(runId);
    assert.throws(() => store.commit(changes([value]), context), fail(code));
    assert.deepEqual(store.history(runId), before);
  }
});

test('state paths and workspace roots must be disjoint before creating the data directory', t => {
  const root = directory(t), workspace = join(root, 'workspace'), state = join(workspace, 'nested-state');
  mkdirSync(workspace);
  assert.throws(() => startCoordinator(state, { localWorkspaceRoots: [workspace] }), fail('unsafe_state_path'));
  assert.equal(existsSync(state), false);
  const runtime = startCoordinator(join(root, 'state')); t.after(() => runtime.store.close());
  for (const localPath of [root, join(root, 'state'), join(root, 'state/nested-workspace'), 'relative/workspace']) {
    const records = fixtureRecords(); records.find(r => r.kind === 'workspace').localPath = localPath;
    assert.throws(() => runtime.store.commit(changes(records), context), fail('unsafe_state_path'));
    assert.equal(runtime.store.snapshot().records.length, 0);
  }
});

test('canonical aliases and changed symlinks cannot place disposable paths over the state directory', t => {
  const root = directory(t), state = join(root, 'state'), workspace = join(root, 'workspace'), alias = join(root, 'alias');
  mkdirSync(workspace); symlinkSync(workspace, alias, 'dir');
  const runtime = startCoordinator(state); t.after(() => runtime.store.close());
  const records = fixtureRecords(); records.find(r => r.kind === 'workspace').localPath = alias;
  runtime.store.commit(changes(records), context);
  unlinkSync(alias); symlinkSync(state, alias, 'dir');
  assert.throws(() => startCoordinator(state), fail('unsafe_state_path'));
  assert.throws(() => startCoordinator(state, { localWorkspaceRoots: [alias] }), fail('unsafe_state_path'));
  const dangling = join(root, 'dangling'); symlinkSync(join(state, 'not-created'), dangling);
  assert.throws(() => startCoordinator(join(root, 'other-state'), { localWorkspaceRoots: [dangling] }), fail('unsafe_state_path'));
});

test('linked database and journal files are preserved and rejected before SQLite opens them', t => {
  const root = directory(t), unmanaged = join(root, 'unmanaged'); writeFileSync(unmanaged, 'PRESERVE');
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const state = join(root, `state-${suffix || 'db'}`); mkdirSync(state);
    symlinkSync(unmanaged, join(state, `state.sqlite${suffix}`));
    assert.throws(() => startCoordinator(state), fail('unsafe_state_path'));
  }
  const state = join(root, 'hardlinked-state'); mkdirSync(state); linkSync(unmanaged, join(state, 'state.sqlite'));
  assert.throws(() => startCoordinator(state), fail('unsafe_state_path'));
  assert.equal(readFileSync(unmanaged, 'utf8'), 'PRESERVE');
});

test('schema v1 upgrades to v2 preserving all original records and audit; failed next migration preserves history', t => {
  const root = directory(t), state = join(root, 'state'); mkdirSync(state);
  const db = new DatabaseSync(join(state, 'state.sqlite'));
  db.exec('PRAGMA foreign_keys=ON');
  migrate(db, migrations.slice(0, 1));
  const tables = { installation: 'installations', request: 'requests', run: 'runs', workspace: 'workspaces', operation: 'operations', outbox: 'outbox', deployment: 'deployments', session: 'sessions', projection: 'projections' };
  const records = fixtureRecords();
  for (const value of records) {
    db.prepare(`INSERT INTO ${tables[value.kind]}(id,payload) VALUES (?,?)`).run(value.id, JSON.stringify(value));
    db.prepare('INSERT INTO audit VALUES (?,?)').run(`audit-${value.id}`, JSON.stringify({ schemaVersion: '1.0', id: `audit-${value.id}`, at: timestamp, ...context, previousRevision: null, recovery: false, record: value }));
  }
  db.close();
  const runtime = startCoordinator(state); t.after(() => runtime.store.close());
  assert.equal(runtime.recovered.records.length, records.length);
  assert.equal(runtime.store.get('session', 'session-enrollment-test').sessionId, 'opaque/session/1');
  const before = runtime.store.history(runId);
  const upgraded = new DatabaseSync(join(state, 'state.sqlite')); t.after(() => upgraded.close());
  assert.equal(upgraded.prepare('PRAGMA user_version').get().user_version, 2);
  assert.throws(() => migrate(upgraded, [...migrations, { version: 3, sql: 'CREATE TABLE partial_upgrade (id TEXT); INVALID SQL;' }]), fail('migration_failed'));
  assert.deepEqual(runtime.store.history(runId), before);
  assert.equal(upgraded.prepare("SELECT name FROM sqlite_master WHERE name='partial_upgrade'").get(), undefined);
});
