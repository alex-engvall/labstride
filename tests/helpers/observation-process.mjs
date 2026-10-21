import { startCoordinator } from '../../apps/coordinator/main.ts';
import { createObservationWorker } from '../../packages/core/observation-worker.ts';
import { provider, hook } from './observation-fixture.mjs';
const [mode, state, target] = process.argv.slice(2);
const { store } = startCoordinator(state, { clock: { now: () => '2026-10-22T12:00:00.000Z' } });
const barrier = stage => { process.send({ stage }); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); };
process.on('message', async () => {
  if (mode === 'hook') {
    store.receiveHook('session-enrollment-test', hook(store.get('session', 'session-enrollment-test'))); barrier('hook-committed');
  }
  const p = store.get('projection', 'projection-test'), external = provider(target, p);
  if (mode === 'lost-write') {
    const write = external.adapter.write.bind(external.adapter);
    external.adapter.write = async (...args) => { const result = await write(...args); barrier('write-committed'); return result; };
  }
  const worker = createObservationWorker(store, { sessions: new Map(), projections: new Map([[p.providerId, external.adapter]]) });
  await worker.tick(); process.send({ stage: 'done', state: store.delivery(`projection:${p.id}`).state });
  external.close(); store.close(); process.disconnect();
});
process.send({ stage: 'ready' });
