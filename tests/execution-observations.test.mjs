import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { startCoordinator } from '../apps/coordinator/main.ts';
import { createObservationWorker } from '../packages/core/observation-worker.ts';
import { PreEffectTransient } from '../packages/core/worker.ts';
import { seed, schedule, nextGeneration, completeGeneration, context } from './helpers/execution-fixture.mjs';
import { enroll, hook, observation, provider } from './helpers/observation-fixture.mjs';
const fail = code => e => e.code === code;
const message = async p => (await once(p, 'message', { signal: AbortSignal.timeout(10000) }))[0];
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'labstride-observations-')), state = join(root,'state'); let time = '2026-10-21T12:00:00.000Z';
  const clock = { now: () => time }, { store } = startCoordinator(state, { clock }); seed(store); const plan = schedule(store), session = enroll(store);
  const target = join(root,'provider.sqlite'), external = provider(target, plan.projections[0]);
  t.after(() => { external.close(); store.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, state, store, plan, session, external, target, clock, advance() { time = new Date(Date.parse(time) + 120000).toISOString(); } };
}
function worker(f, opts = {}) {
  return createObservationWorker(f.store, { sessions: new Map([[f.session.providerId, { async observe() { return observation(f.session); } }]]),
    projections: new Map([[f.plan.projections[0].providerId, f.external.adapter]]), random: () => 0, ...opts });
}
async function child(t, mode, f) {
  const p = fork(new URL('./helpers/observation-process.mjs', import.meta.url), [mode,f.state,f.target], { stdio: ['ignore','pipe','pipe','ipc'] });
  p.exited = once(p, 'exit');
  t.after(async () => { if (p.exitCode === null && p.signalCode === null) { const exit = p.exited; p.kill('SIGKILL'); await exit; } });
  assert.equal((await message(p)).stage,'ready'); return p;
}
test('advisory hooks commit before acknowledgement, deduplicate and reject foreign/fabricated authority', t => {
  const f = fixture(t), input = hook(f.session), first = f.store.receiveHook(f.session.id,input);
  f.advance(); const duplicate = f.store.receiveHook(f.session.id,input);
  assert.equal(duplicate.outcome,'duplicate'); assert.equal(duplicate.observationId,first.observationId);
  for (const mutation of [{ sessionId: 'foreign' }, { requestGeneration: 2 }, { runId: 'foreign' }, { workspaceId: 'foreign' }, { providerId: 'foreign' }])
    assert.throws(() => f.store.receiveHook(f.session.id,{ ...input,...mutation }), fail('identity_conflict'));
  for (const mutation of [{ kind: 'run.completed' }, { approval: true }, { kind: 'plan.approved' }])
    assert.throws(() => f.store.receiveHook(f.session.id,{ ...input,...mutation }), fail('invalid_payload'));
  assert.equal(f.store.get('run',f.plan.run.id).state,'queued');
  assert.equal(f.store.get('operation',f.plan.operation.id).state,'prepared');
});
test('hook-free startup and periodic reads retain the original session without granting continuation', async t => {
  const f = fixture(t); let reads = 0;
  const w = worker(f,{ sessions: new Map([[f.session.providerId,{ async observe(session) {
    reads++; assert.equal(session.sessionId,f.session.sessionId);
    return observation(session,{ state: 'waiting_human', humanActivityRevision: 8 });
  } }]]) });
  await w.tick(); f.advance(); await w.tick();
  assert.equal(reads,2); assert.equal(f.store.get('session',f.session.id).owner,'human');
  assert.equal(f.store.get('run',f.plan.run.id).state,'queued'); assert.equal(f.store.get('operation',f.plan.operation.id).state,'prepared');
});
test('late backend response cannot overwrite a human revision or consume a hook arriving during the read', async t => {
  const f = fixture(t); f.store.bootObservations(); const poll = f.store.dueSessions()[0];
  const previous = f.store.get('session',f.session.id);
  f.store.commit([{ record: { ...previous, revision: 2, humanActivityRevision: 9, lastTurnId: 'human-turn', state: 'waiting_human' }, expectedRevision: 1 }], context);
  assert.throws(() => f.store.applySession(poll,1,observation(f.session),60000),fail('revision_conflict'));
  f.store.receiveHook(f.session.id,hook(f.session));
  assert.throws(() => f.store.applySession(poll,2,observation(previous,{ humanActivityRevision: 9 }),60000),fail('revision_conflict'));
  assert.equal(f.store.get('session',f.session.id).lastTurnId,'human-turn');
});
test('reordered hooks re-observe authoritative state and cannot regress a newer generation', async t => {
  const f = fixture(t); const newer = { ...hook(f.session,'new'), sourceVersion:'opaque:new', turnId:'new-turn' };
  f.store.receiveHook(f.session.id,newer); f.store.receiveHook(f.session.id,hook(f.session,'old'));
  await worker(f,{ sessions:new Map([[f.session.providerId,{ async observe() { return observation(f.session,{ lastTurnId:'current-turn',humanActivityRevision:8 }); } }]]) }).tick();
  assert.equal(f.store.get('session',f.session.id).lastTurnId,'current-turn');
  completeGeneration(f.store); nextGeneration(f.store);
  assert.throws(() => f.store.receiveHook(f.session.id,hook(f.session,'late')),fail('identity_conflict'));
  assert.equal(f.store.snapshot().records.filter(r => r.kind==='session').length,1);
});
test('session observation and its progress projection commit atomically', t => {
  const f = fixture(t); f.store.bootObservations(); const poll = f.store.dueSessions()[0];
  const projected = { ...f.plan.projections[0], id:'session-progress' };
  assert.throws(() => f.store.applySession(poll,1,observation(f.session,{ state:'busy' }),60000,[{ ...projected,runId:'foreign' }]),fail('identity_conflict'));
  assert.equal(f.store.get('session',f.session.id).state,'ready');
  f.store.applySession(poll,1,observation(f.session,{ state:'busy' }),60000,[projected]);
  assert.equal(f.store.delivery(`projection:${projected.id}`).state,'pending');
});
test('failed pre-effect projection retries with fresh state; a human edit is preserved after restart', async t => {
  const f = fixture(t); f.external.adapter.failWrite = true; await worker(f).tick(); assert.equal(f.external.count(),0);
  f.external.human(); f.advance(); f.external.adapter.failWrite = false;
  const restarted = startCoordinator(f.state,{ clock:f.clock }); t.after(() => restarted.store.close());
  await worker({ ...f,store:restarted.store }).tick();
  assert.equal(f.external.view().value,'human-edited'); assert.equal(f.external.count(),0);
  assert.equal(f.store.delivery('projection:projection-test').state,'conflict');
});
test('known pre-effect failure can retry successfully; uncertain writes are observed without repetition', async t => {
  const f = fixture(t); f.external.adapter.failWrite = true; const w = worker(f); await w.tick();
  f.advance(); f.external.adapter.failWrite = false; f.external.adapter.dropReply = true; await w.tick();
  assert.equal(f.external.count(),1); f.advance(); await w.tick();
  assert.equal(f.external.count(),1); assert.equal(f.store.delivery('projection:projection-test').state,'done');
});
test('read failure after a committed write cannot be misclassified as pre-effect', async t => {
  const f = fixture(t); const read = f.external.adapter.read.bind(f.external.adapter); let calls = 0;
  f.external.adapter.read = async (...args) => { if (++calls === 2) throw new PreEffectTransient(); return read(...args); };
  const w = worker(f); await w.tick(); f.advance(); await w.tick();
  assert.equal(f.external.count(),1); assert.equal(f.store.delivery('projection:projection-test').state,'done');
});
test('unsupported atomic generation/version guards and superseded projections never write', async t => {
  const f = fixture(t); f.external.adapter.atomicPrecondition = false; await worker(f).tick();
  assert.equal(f.external.count(),0); assert.equal(f.store.delivery('projection:projection-test').lastError,'unsupported_capability');
  f.store.resumeObservation('projection:projection-test',context); completeGeneration(f.store); nextGeneration(f.store); f.external.adapter.atomicPrecondition = true;
  await worker(f).tick(); assert.equal(f.external.count(),0); assert.equal(f.store.delivery('projection:projection-test').state,'superseded');
});
test('an in-flight uncertain write with unchanged provider state is never resent', async t => {
  const f = fixture(t); const d = f.store.delivery('projection:projection-test');
  f.store.beginProjection('projection-test',d.revision,f.external.view());
  const w = worker(f); await w.tick(); f.advance(); await w.tick();
  assert.equal(f.external.count(),0); assert.equal(f.store.delivery(d.id).state,'reconcile');
});
test('human change between read and write is rejected atomically by the provider', async t => {
  const f = fixture(t); const write = f.external.adapter.write.bind(f.external.adapter);
  f.external.adapter.write = async (...args) => { f.external.human(); return write(...args); };
  const w = worker(f); await w.tick(); f.advance(); await w.tick();
  assert.equal(f.external.count(),0); assert.equal(f.external.view().value,'human-edited');
});
for (const mode of ['hook','lost-write']) test(`actual process death after ${mode} commit preserves recovery identity`, async t => {
  const f = fixture(t); const p = await child(t,mode,f); const reply = message(p); p.send('go');
  assert.equal((await reply).stage,mode==='hook'?'hook-committed':'write-committed');
  const exit = p.exited; p.kill('SIGKILL'); await exit;
  if (mode === 'hook') {
    const receipt = f.store.receiveHook(f.session.id,hook(f.session)); assert.equal(receipt.outcome,'duplicate');
    assert.equal(f.store.get('session',f.session.id).sessionId,f.session.sessionId);
  } else {
    const restarted = await child(t,'recover',f); const done = message(restarted); const exited = restarted.exited; restarted.send('go');
    assert.equal((await done).state,'done'); await exited; assert.equal(f.external.count(),1);
  }
});
test('session observation failure is bounded and requires explicit recovery across restart', async t => {
  const f = fixture(t); let reads = 0;
  const opts = { sessions:new Map([[f.session.providerId,{ async observe() { reads++; throw Error('unavailable'); } }]]), retry:{ maxAttempts:2,baseMs:1000,capMs:60000 } };
  let w = worker(f,opts); await w.tick(); f.advance(); await w.tick(); f.advance();
  w = worker(f,opts); await w.tick(); assert.equal(reads,2);
  f.store.resumeSessionObservation(f.session.id,context); await w.tick(); assert.equal(reads,3);
});
test('concurrent projection workers perform one conditional write', async t => {
  const f = fixture(t); const one = worker(f), two = worker(f);
  await Promise.all([one.tick(),two.tick()]); assert.equal(f.external.count(),1);
});
test('a human edit after a lost write response is preserved during real process restart', async t => {
  const f = fixture(t); const p = await child(t,'lost-write',f); const ready = message(p); p.send('go');
  assert.equal((await ready).stage,'write-committed'); const exit=p.exited; p.kill('SIGKILL'); await exit;
  f.external.human('new-human-decision');
  const next = await child(t,'recover',f); const done = message(next), exited=next.exited; next.send('go');
  assert.equal((await done).state,'conflict'); await exited;
  assert.equal(f.external.count(),1); assert.equal(f.external.view().value,'new-human-decision');
});
test('explicit application composition pauses restore before any worker can dispatch', async t => {
  const f = fixture(t); const { startExecution } = await import('../apps/coordinator/runtime.ts'); let starts=0;
  const adapter = { async validate() {}, async start() { starts++; throw Error(); }, async reconcile() { throw Error('no evidence'); } };
  const { actionKey } = await import('../packages/core/worker.ts');
  const runtime = startExecution(f.state,{ restore:context,dependencies:{ clock:f.clock },
    actions:{ executorId:'test',nextAttempt:()=> 'attempt',adapters:new Map([[actionKey(f.plan.operation.request.actionId,f.plan.operation.request.actionVersion),adapter]]) },
    observations:{ sessions:new Map(),projections:new Map([[f.plan.projections[0].providerId,f.external.adapter]]) } });
  await runtime.tick(); await runtime.close(); assert.equal(starts,0); assert.equal(f.external.count(),0);
});
