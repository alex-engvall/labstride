import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { startCoordinator } from '../apps/coordinator/main.ts';
import { SqliteStore } from '../packages/storage-sqlite/store.ts';
import { eventInput, startPlan, context, seed, schedule } from './helpers/execution-fixture.mjs';
const fail = code => e => e.code === code;
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'labstride-inbox-')); const { store } = startCoordinator(root); seed(store);
  t.after(() => { store.close(); rmSync(root, { recursive: true, force: true }); }); return { root, store };
}
const message = async child => (await once(child, 'message', { signal: AbortSignal.timeout(10000) }))[0];
async function child(t, mode, root) {
  const p = fork(new URL('./helpers/inbox-process.mjs', import.meta.url), [mode, root], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  t.after(() => { if (p.exitCode === null && p.signalCode === null) p.kill('SIGKILL'); });
  assert.equal((await message(p)).stage, 'ready'); return p;
}
test('inbox deduplication, conflict and checkpoint compare-and-set are atomic', t => {
  const { store } = fixture(t); const input = eventInput(), first = store.receive(input);
  assert.deepEqual(store.receive(input), { ...first, duplicate: true });
  const conflict = structuredClone(input); conflict.event.facts.generation = 2;
  assert.throws(() => store.receive(conflict), fail('identity_conflict'));
  const next = structuredClone(input); next.event.externalId = 'other'; next.checkpoint.cursor = 'other';
  assert.throws(() => store.receive(next), fail('revision_conflict'));
  assert.equal(store.pendingEvents().length, 1);
  assert.deepEqual(store.checkpoint('installation-test', 'test-provider', 'requests'), { revision: 1, cursor: 'cursor-1' });
  assert.throws(() => store.receive({ ...input, schemaVersion: '99' }), fail('invalid_payload'));
});
test('authorized schedule atomically binds one original graph and rejects generic execution writes', t => {
  const { store, root } = fixture(t); const plan = schedule(store);
  assert.equal(store.scheduleStart(store.receive(eventInput()).id, startPlan(), context), plan.run.id);
  assert.equal(store.snapshot().records.filter(r => r.kind === 'run').length, 1);
  assert.equal(store.pendingEvents().length, 0);
  const plain = new SqliteStore(root); t.after(() => plain.close());
  assert.throws(() => plain.commit([{ record: { ...plan.operation, revision: 2, state: 'claimed' }, expectedRevision: 1 }], context), fail('recovery_required'));
});
test('observation origin, mismatched actor, forged generation and invalid plan cannot authorize start', t => {
  const { store } = fixture(t); const input = eventInput(); input.event.origin = 'extension';
  const id = store.receive(input).id;
  assert.throws(() => store.scheduleStart(id, startPlan(), context), fail('identity_conflict'));
  assert.equal(store.snapshot().records.length, 1);
  assert.equal(store.pendingEvents().length, 1);
});
test('concurrent real processes converge on the original request/run/workspace', async t => {
  const { store, root } = fixture(t); const children = await Promise.all([child(t, 'race', root), child(t, 'race', root)]);
  const replies = children.map(message), exits = children.map(p => once(p, 'exit')); children.forEach(p => p.send('go'));
  assert.deepEqual((await Promise.all(replies)).map(r => r.run), [startPlan().run.id, startPlan().run.id]); await Promise.all(exits);
  for (const kind of ['request', 'run', 'workspace', 'operation', 'outbox']) assert.equal(store.snapshot().records.filter(r => r.kind === kind).length, 1);
});
for (const mode of ['before', 'after', 'ack']) test(`real process loss at ${mode} boundary recovers durable inbox and atomic scheduling`, async t => {
  const { root, store } = fixture(t); const p = await child(t, mode, root); const reply = message(p); p.send('go');
  assert.equal((await reply).stage, mode); const exit = once(p, 'exit'); p.kill('SIGKILL'); await exit;
  const reboot = startCoordinator(root); t.after(() => reboot.store.close());
  assert.equal(reboot.store.snapshot().records.filter(r => r.kind === 'run').length, mode === 'after' ? 1 : 0);
  const receipt = reboot.store.receive(eventInput()); assert.equal(receipt.duplicate, true);
  assert.equal(reboot.store.scheduleStart(receipt.id, startPlan(), context), startPlan().run.id);
  assert.equal(store.snapshot().records.filter(r => r.kind === 'operation').length, 1);
});
