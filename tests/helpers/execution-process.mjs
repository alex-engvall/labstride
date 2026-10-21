import { startCoordinator } from '../../apps/coordinator/main.ts';
import { createWorker, actionKey } from '../../packages/core/worker.ts';
import { startPlan } from './execution-fixture.mjs';
const [mode, directory, url] = process.argv.slice(2);
const barrier = stage => { process.send({ stage }); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); };
const { store } = startCoordinator(directory);
if (mode === 'after-claim') {
  const claim = store.claim.bind(store); store.claim = (...args) => { const result = claim(...args); barrier('after-claim'); return result; };
}
const send = async (route, operation, headers = {}) => (await fetch(url + route, { method: 'POST', body: JSON.stringify(operation), headers })).json();
const adapter = {
  async validate() {},
  async start(operation) {
    if (mode === 'after-boundary') barrier('after-boundary');
    const result = await send('/start', operation, mode === 'lost-reply' ? { 'x-drop-reply': '1' } : {});
    if (mode === 'after-effect') barrier('after-effect');
    return result;
  },
  async reconcile(operation) { return send('/observe', operation); },
};
const operation = startPlan().operation;
const worker = createWorker(store, { executorId: 'test-executor', nextAttempt: () => 'test-attempt', adapters: new Map([[actionKey(operation.request.actionId, operation.request.actionVersion), adapter]]) });
process.on('message', async () => {
  try { if (mode === 'claim-race') { const claim = store.claim(operation.id, `executor:${process.pid}`, 'attempt'); process.send({ stage:'claimed', claimId:claim.id }); store.close(); process.disconnect(); return; } await worker.tick(); await worker.drain(); process.send({ stage: 'done', state: store.get('operation', operation.id).state }); }
  catch (e) { process.send({ error: e.code ?? e.message }); }
  store.close(); process.disconnect();
});
process.send({ stage: 'ready' });
