import { randomUUID } from 'node:crypto';
import { startCoordinator } from '../../apps/coordinator/main.ts';
import { changes, context, fixtureRecords } from './lifecycle-fixture.mjs';

const [mode, dataDir] = process.argv.slice(2);
const records = fixtureRecords();
let calls = 0;
const wait = stage => {
  process.send({ stage });
  // Wait synchronously inside the tested transaction until the parent SIGKILLs this child.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
};
const dependencies = mode === 'before' ? { identities: { next() {
  if (++calls === records.length) wait('before_commit');
  return randomUUID();
} } } : {};
const { store } = startCoordinator(dataDir, dependencies);
if (mode === 'revision') {
  process.on('message', message => {
    if (message !== 'go') return;
    try {
      const original = records.find(record => record.kind === 'run');
      store.commit([{ record: { ...original, state: 'preparing', revision: 2 }, expectedRevision: 1 }], context);
      process.send({ result: 'ok' });
    } catch (error) { process.send({ result: error.code }); }
    store.close(); process.disconnect();
  });
  process.send({ stage: 'ready' });
} else {
  store.commit(changes(records), context);
  wait('after_commit');
}
