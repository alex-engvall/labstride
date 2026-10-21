import { readFileSync } from 'node:fs';

export const context = { actorId: 'operator-test', reason: 'Owned synthetic lifecycle test', evidenceRefs: ['test:observation'] };
export const timestamp = '2026-10-21T12:00:00.000Z';
export function record(kind, id, fields) {
  return { schemaVersion: '1.0', kind, id, revision: 1, createdAt: timestamp, updatedAt: timestamp, ...fields };
}
export function fixtureRecords() {
  const request = JSON.parse(readFileSync(new URL('../../examples/operation.json', import.meta.url), 'utf8'));
  return [
    record('installation', 'installation-test', { configRevision: 'config-1' }),
    record('request', 'request-test', { installationId: 'installation-test', providerId: 'test-provider', issueId: 'issue-test', generation: 1 }),
    record('run', request.runId, { requestId: 'request-test', repositoryId: request.source.repositoryId, configRevision: 'config-1', state: 'queued', paused: false, checkpoint: null }),
    record('workspace', request.workspaceId, { runId: request.runId, targetId: request.targetId, locator: 'test:workspace', localPath: null,
      ownershipRef: 'test:ownership', branch: 'test-branch', state: 'requested', keep: true }),
    record('operation', request.operationId, { runId: request.runId, workspaceId: request.workspaceId, request, state: 'prepared', effectBoundary: 'not_crossed' }),
    record('outbox', 'intent-test', { runId: request.runId, operationId: request.operationId, intentKey: 'test:original-intent', payload: { schemaVersion: '1.0', operationId: request.operationId } }),
    record('deployment', 'deployment-test', { runId: request.runId, operationId: request.operationId, targetId: request.targetId, sourceSha: request.source.sha, state: 'requested' }),
    record('session', 'session-enrollment-test', { runId: request.runId, workspaceId: request.workspaceId, providerId: 'test-session-provider', sessionId: 'opaque/session/1', lastTurnId: 'opaque/turn/1', humanActivityRevision: 7, state: 'ready', owner: 'human' }),
    record('projection', 'projection-test', { runId: request.runId, providerId: 'test-provider', subjectId: 'issue-test', fieldId: 'configured-field', generation: 1,
      payload: { schemaVersion: '1.0', expectedFingerprint: 'observed-version-1', value: 'queued' } }),
  ];
}
export const changes = records => records.map(record => ({ record, expectedRevision: null }));
export function update(store, kind, id, fields, recovery = false, audit = context) {
  const previous = store.get(kind, id);
  store.commit([{ record: { ...previous, ...fields, revision: previous.revision + 1 }, expectedRevision: previous.revision, recovery }], audit);
}
