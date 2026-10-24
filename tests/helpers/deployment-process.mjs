import { readFileSync } from 'node:fs';
import { startCoordinator } from '../../apps/coordinator/main.ts';
import { configuredWorkflowAction } from '../../packages/workflow-broker/action.ts';
import { localJsonObserver } from '../../packages/workflow-broker/local-observer.ts';
import { observerKey } from '../../packages/core/deployments.ts';
import { policyDependencies } from './configuration-fixture.mjs';
const [directory, mode, dataFile] = process.argv.slice(2), data = JSON.parse(readFileSync(dataFile, 'utf8'));
const { store } = startCoordinator(directory, { ...policyDependencies, clock: { now: () => data.now } });
const barrier = stage => { process.send({ stage }); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); };
if (mode === 'after-evidence') {
  const record = store.recordDeploymentObservation.bind(store);
  store.recordDeploymentObservation = (...args) => { const result = record(...args); barrier(mode); return result; };
}
if (mode === 'during-finalization' || mode === 'during-supersession') {
  const write = store.write.bind(store);
  store.write = (...args) => {
    write(...args);
    if (args[0].some(change => change.record.kind === 'deployment' && change.record.state === (mode === 'during-supersession' ? 'superseded' : 'verified'))) barrier(mode);
  };
}
const observer = localJsonObserver();
const provider = { find: async () => [data.run], run: async () => data.run, compare: async () => data.comparison };
const adapter = configuredWorkflowAction(store, data.host, provider, new Map([[observerKey(observer.id, observer.version), observer]]));
store.markUnknown(data.operationId);
const operation = store.get('operation', data.operationId), epoch = store.recoveryEpoch();
const result = await adapter.reconcile(operation.request, null);
store.acceptResult(result, null, operation.revision, [], epoch);
barrier('after-finalization');
