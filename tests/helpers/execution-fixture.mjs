import { fixtureRecords, context, timestamp } from './lifecycle-fixture.mjs';
import { requestDigest } from '../../packages/storage-sqlite/execution.ts';
export { context, timestamp };
export function startPlan() {
  const records = fixtureRecords();
  const by = kind => records.find(r => r.kind === kind);
  const plan = { request: by('request'), run: by('run'), workspace: by('workspace'), operation: by('operation'), outbox: by('outbox'), projections: [by('projection')], resourceKey: 'target:synthetic-resource' };
  plan.operation.request.deadline = '2099-01-01T00:00:00.000Z';
  plan.operation.request.requestDigest = requestDigest(plan.operation.request);
  return plan;
}
export function eventInput() {
  return { schemaVersion: '1.0', stream: 'requests', checkpoint: { expectedRevision: 0, cursor: 'cursor-1' }, event: {
    schemaVersion: '1.0', eventId: 'start-event', installationId: 'installation-test', provider: 'test-provider',
    kind: 'start.requested', origin: 'human', externalId: 'delivery-1', subjectId: 'issue-test', actorId: context.actorId,
    occurredAt: timestamp, observedAt: timestamp, sourceVersion: 'opaque:v1', facts: { generation: 1 },
  } };
}
export function seed(store) { store.commit([{ record: fixtureRecords()[0], expectedRevision: null }], context); }
export function schedule(store) { const receipt = store.receive(eventInput()); const plan = startPlan(); store.scheduleStart(receipt.id, plan, context); return plan; }
