import { startCoordinator } from '../../apps/coordinator/main.ts';
import { eventInput, startPlan, context } from './execution-fixture.mjs';
import { randomUUID } from 'node:crypto';
const [mode, directory] = process.argv.slice(2);
const barrier = stage => { process.send({ stage }); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); };
let calls = 0;
const runtime = startCoordinator(directory, mode === 'before' ? { identities: { next() { if (++calls === 3) barrier('before'); return randomUUID(); } } } : {});
process.on('message', () => {
  try {
    const receipt = runtime.store.receive(eventInput());
    if (mode === 'ack') barrier('ack');
    const run = runtime.store.scheduleStart(receipt.id, startPlan(), context);
    if (mode === 'before' || mode === 'after') barrier('after');
    process.send({ run });
  } catch (e) { process.send({ error: e.code }); }
  runtime.store.close(); process.disconnect();
});
process.send({ stage: 'ready' });
