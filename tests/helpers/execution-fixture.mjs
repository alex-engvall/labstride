import { fixtureRecords, context, timestamp } from './lifecycle-fixture.mjs';
import { requestDigest } from '../../packages/storage-sqlite/execution.ts';
export { context, timestamp };
export function startPlan() {
  const records = fixtureRecords().map(r => ({ ...r, createdAt: '2026-10-20T12:00:00.000Z', updatedAt: '2026-10-20T12:00:00.000Z' }));
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
export function nextGeneration(store, generation = 2) {
  const plan = startPlan(), suffix = `:g${generation}`;
  for (const key of ['request','run','workspace','operation','outbox']) plan[key].id += suffix;
  plan.workspace.locator += suffix; plan.workspace.branch += suffix;
  plan.request.generation = generation;
  plan.run.requestId = plan.request.id;
  plan.workspace.runId = plan.run.id;
  Object.assign(plan.operation, { runId: plan.run.id, workspaceId: plan.workspace.id });
  Object.assign(plan.operation.request, { runId: plan.run.id, workspaceId: plan.workspace.id, operationId: plan.operation.id });
  plan.operation.request.requestDigest = requestDigest(plan.operation.request);
  Object.assign(plan.outbox, { runId: plan.run.id, operationId: plan.operation.id, intentKey: `intent${suffix}` });
  plan.outbox.payload.operationId = plan.operation.id;
  plan.projections = [];
  const input = eventInput(); input.checkpoint = null; input.event.eventId += suffix; input.event.externalId += suffix; input.event.facts.generation = generation;
  store.scheduleStart(store.receive(input).id, plan, context); return plan;
}
export function nextIssue(store, index = 2, capacityClass = 'development', resourceKey = null) {
  const plan = startPlan(), suffix = `:issue${index}`;
  for (const key of ['request','run','workspace','operation','outbox']) plan[key].id += suffix;
  plan.request.issueId += suffix; plan.run.requestId = plan.request.id; plan.workspace.runId = plan.run.id;
  plan.workspace.locator += suffix; plan.workspace.branch += suffix;
  Object.assign(plan.operation,{runId:plan.run.id,workspaceId:plan.workspace.id});
  Object.assign(plan.operation.request,{runId:plan.run.id,workspaceId:plan.workspace.id,operationId:plan.operation.id});
  plan.operation.request.requestDigest=requestDigest(plan.operation.request);
  Object.assign(plan.outbox,{runId:plan.run.id,operationId:plan.operation.id,intentKey:`intent${suffix}`});
  plan.outbox.payload.operationId=plan.operation.id;plan.projections=[];plan.capacityClass=capacityClass;plan.resourceKey=resourceKey??plan.resourceKey+suffix;
  const input=eventInput();input.checkpoint=null;input.event.eventId+=suffix;input.event.externalId+=suffix;input.event.subjectId=plan.request.issueId;
  store.scheduleStart(store.receive(input).id,plan,context);return plan;
}
export function completeGeneration(store) {
  const plan=startPlan(), claim=store.claim(plan.operation.id,'fixture','fixture');store.beginEffect(claim);
  store.acceptResult({schemaVersion:'1.0',kind:'result',operationId:plan.operation.id,requestDigest:plan.operation.request.requestDigest,
    result:{status:'succeeded',handle:null,resources:[],outputs:{},evidenceRefs:['test:completion'],error:null}},claim,1);
  for(const state of ['preparing','ready','active','completed']) {
    const run=store.get('run',plan.run.id);store.commit([{record:{...run,state,revision:run.revision+1},expectedRevision:run.revision}],context);
  }
}
