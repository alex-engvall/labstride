import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { createLocalJWKSet } from 'jose';
import { startExecution } from '../../apps/coordinator/runtime.ts';
import { policyDependencies } from './configuration-fixture.mjs';
import { createWorkflowBroker } from '../../packages/workflow-broker/server.ts';
import { createWorkflowVerifier } from '../../packages/workflow-broker/identity.ts';
import { acquireServiceLock } from '../../packages/operations/loop.ts';

const [state, file] = process.argv.slice(2), data = JSON.parse(readFileSync(file));
await acquireServiceLock(state);
const runtime = startExecution(state, { mode: 'reconcile-only', dependencies: { ...policyDependencies, clock: { now: () => data.now } },
  actions: { executorId: 'recovery-child', nextAttempt: () => 'never', adapters: new Map() }, observations: { sessions: new Map(), projections: new Map() } });
const store = new Proxy(runtime.store, { get(target, key) {
  if (key === 'acceptWorkflowReceipt') return (...args) => {
    target.acceptWorkflowReceipt(...args);
    process.send({ committed: true });
    // Stop synchronously after SQLite commit, before the HTTP handler can reply.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  };
  const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
} });
const provider = { async run(_enrollment, id, attempt) { return data.runs.find(run => run.runId === id && run.runAttempt === attempt); } };
const verify = createWorkflowVerifier(provider, { getKey: createLocalJWKSet({ keys: [data.jwk] }), currentDate: new Date(data.now) });
const server = createWorkflowBroker(store, provider, verify, { allowEffects: () => false });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
process.send({ origin: `http://127.0.0.1:${server.address().port}` });
