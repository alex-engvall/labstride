import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { validate } from '../tools/conformance/schema.mjs';
import { loadFixture, sha256, validateRequest, validateResponse } from '../tools/conformance/load-artifact.mjs';
import { openHookStore, recordHook } from '../tools/conformance/hook-store.mjs';

const read = name => JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
const manifest = read('extension');
const host = { protocol: { major: 1, minor: 1 }, capabilities: ['github.workflow.v1'],
  extensionCapabilities: ['example.workflow-dispatch.v1'], requiredExtensionCapabilities: ['example.workflow-dispatch.v1'],
  permissions: ['network.github', 'network.broker', 'workflow.dispatch'] };

function artifact(change = () => {}) {
  const key = `fixture_${randomUUID()}`;
  const value = { schemaVersion: '1.0', manifest: structuredClone(manifest),
    module: `globalThis[${JSON.stringify(key)}] = true; export const fixture = true;` };
  change(value);
  const bytes = Buffer.from(JSON.stringify(value));
  return { bytes, key, pin: { id: manifest.id, version: manifest.version, kind: manifest.kind, integrity: sha256(bytes) } };
}

for (const [name, change, expected] of [
  ['wrong protocol major', x => { x.manifest.protocol.major = 2; }, /validation_failed/],
  ['unknown schema version', x => { x.manifest.schemaVersion = '2.0'; }, /validation_failed/],
  ['missing host capability', x => { x.manifest.requiredCapabilities.push('host.unavailable.v1'); }, /unsupported_required_capability/],
  ['missing extension capability', x => { x.manifest.capabilities = ['different.v1']; }, /missing_extension_capability/],
  ['ungranted permission', x => { x.manifest.permissions.push('network.ssh'); }, /forbidden_permission/],
  ['changed package identity', x => { x.manifest.id = 'foreign.extension'; }, /identity_mismatch/],
]) test(`before import: ${name}`, async () => {
  const { bytes, key, pin } = artifact(change);
  await assert.rejects(loadFixture(bytes, pin, host), expected);
  assert.equal(globalThis[key], undefined);
});

test('changed artifact bytes, including manifest, fail integrity before import', async () => {
  const { bytes, key, pin } = artifact();
  const changed = JSON.parse(bytes);
  changed.manifest.version = '0.2.0';
  await assert.rejects(loadFixture(Buffer.from(JSON.stringify(changed)), pin, host), /integrity_mismatch/);
  assert.equal(globalThis[key], undefined);
});

test('optional minor/capabilities negotiate; original verified bytes are imported once', async () => {
  const { bytes, key, pin } = artifact(x => {
    x.manifest.protocol.minor = 3;
    x.manifest.capabilities.push('optional.unknown.v1');
  });
  const result = await loadFixture(bytes, pin, host);
  assert.deepEqual(result.protocol, { major: 1, minor: 1 });
  assert.deepEqual(result.capabilities, ['example.workflow-dispatch.v1']);
  assert.equal(result.module.fixture, true);
  assert.equal(globalThis[key], true);
  delete globalThis[key];
});

const direct = () => ({ status: 'accepted', handle: 'handle-test', resources: [], evidenceRefs: [], outputs: {}, error: null });
const handle = { handle: 'handle-test' };
const operation = { operation: read('operation') };
const capability = { protocol: { major: 1, minor: 0 }, capabilities: [] };
const snapshot = { subjectId: 'issue-test', sourceVersion: 'revision-test', actorId: null,
  observedAt: '2026-10-21T00:00:00Z', fields: {} };
const rows = {
  provider: {
    capabilities: [{}, capability], readSnapshot: [{ subjectId: 'issue-test' }, snapshot],
    subscribe: [{ cursor: null }, { events: [], nextCursor: null }],
    reconcile: [{ subjectId: 'issue-test', cursor: null }, snapshot],
    project: [{ subjectId: 'issue-test', expectedVersion: 'revision-test', fields: {} }, { subjectId: 'issue-test', sourceVersion: 'revision-next' }],
  },
  connector: {
    probe: [{ targetId: 'target-test' }, { targetId: 'target-test', capabilities: [], evidenceRefs: [] }],
    execute: [operation, direct()],
    upload: [{ operationId: 'operation-test', targetId: 'target-test', artifact: { sha256: 'a'.repeat(64), size: 1 }, path: 'owned/file' }, direct()],
    download: [{ operationId: 'operation-test', targetId: 'target-test', path: 'owned/file' }, direct()],
    inspect: [handle, direct()], cancel: [handle, direct()],
  },
  action: {
    describe: [{}, { id: 'example.action', version: '0.1.0', inputSchema: 'input.schema.json', outputSchema: 'output.schema.json', capabilities: [] }],
    validate: [operation, { normalizedInputs: {} }], start: [operation, direct()], observe: [handle, direct()],
    cancel: [handle, direct()], reconcile: [{ ...operation, handle: null }, direct()],
  },
  'session-provider': { capabilities: [{}, capability] },
};
for (const command of ['start', 'resume', 'observe', 'send', 'interrupt', 'close']) {
  const input = read('session-request');
  Object.assign(input, { command, sessionId: command === 'start' ? null : 'session-test', expectedLastTurnId: 'turn-test' });
  const observation = read('session-observation');
  if (command !== 'start') observation.sessionId = input.sessionId;
  rows['session-provider'][command] = [input, observation];
}
function pair(family, method) {
  const [input, result] = rows[family][method];
  const request = { schemaVersion: '1.0', requestId: `request-${family}-${method}`, extensionId: `example.${family}`,
    protocol: { major: 1, minor: 0 }, family, method, input: structuredClone(input) };
  if (family === 'action' && input.operation) request.extensionId = input.operation.actionId;
  const { input: _, ...identity } = request;
  return [request, { ...identity, outcome: 'ok', result: structuredClone(result), error: null }];
}
for (const [family, methods] of Object.entries(rows)) for (const method of Object.keys(methods)) {
  test(`typed ${family}.${method} request/result`, () => {
    const [request, response] = pair(family, method);
    assert.equal(validateResponse(request, response), response);
  });
}

test('all declared method variants have an exercised request/result pair', () => {
  const schema = JSON.parse(readFileSync(new URL('../schemas/contract-request.schema.json', import.meta.url)));
  const declared = schema.oneOf.map(x => `${x.properties.family.const}.${x.properties.method.const}`).sort();
  const exercised = Object.entries(rows).flatMap(([family, methods]) => Object.keys(methods).map(m => `${family}.${m}`)).sort();
  assert.deepEqual(exercised, declared);
});

test('response correlation, wrong family/method and unknown core fields are rejected', () => {
  const [request, response] = pair('provider', 'readSnapshot');
  assert.throws(() => validateResponse(request, { ...response, requestId: 'foreign-request' }), /identity_mismatch/);
  assert.throws(() => validate('contract-request', { ...request, method: 'start' }), /validation_failed/);
  assert.throws(() => validate('contract-request', { ...request, shell: 'synthetic' }), /validation_failed/);
});

test('direct connector/action output cannot fabricate a workflow executor', () => {
  for (const family of ['connector', 'action']) {
    const [, response] = pair(family, family === 'connector' ? 'execute' : 'start');
    response.result.executor = read('receipt').executor;
    assert.throws(() => validate('contract-result', response), /validation_failed/);
  }
});

test('nested provider/session/action identities cannot be substituted', () => {
  const [session, response] = pair('session-provider', 'send');
  assert.throws(() => validateRequest({ ...session, extensionId: 'foreign.provider' }), /identity_mismatch/);
  response.result.sessionId = 'foreign-session';
  assert.throws(() => validateResponse(session, response), /identity_mismatch/);
  const [action] = pair('action', 'start');
  action.input.operation.actionId = 'foreign.action';
  assert.throws(() => validateRequest(action), /identity_mismatch/);
  const [provider, snapshot] = pair('provider', 'readSnapshot');
  snapshot.result.subjectId = 'foreign-issue';
  assert.throws(() => validateResponse(provider, snapshot), /identity_mismatch/);
});

test('oversized request is rejected before fixture handling', () => {
  const [request] = pair('provider', 'project');
  request.input.fields.large = 'x'.repeat(256 * 1024);
  assert.throws(() => validateRequest(request), /exceeds 256 KiB/);
});

test('unknown outcome requires reconciliation rather than a retryable effect', () => {
  const [request, response] = pair('action', 'start');
  response.outcome = 'outcome_unknown'; response.result = null;
  response.error = { code: 'outcome_unknown', message: 'Synthetic lost reply', evidenceId: null, retryClass: 'reconcile' };
  validateResponse(request, response);
  response.error.retryClass = 'pre_effect_transient';
  assert.throws(() => validateResponse(request, response), /validation_failed/);
});

test('format checks reject malformed timestamps and URI in actual schemas', () => {
  const op = read('operation'); op.deadline = 'not-a-date';
  assert.throws(() => validate('operation', op), /validation_failed/);
  const config = read('installation.template'); config.broker.url = 'not a uri';
  assert.throws(() => validate('config', config), /validation_failed/);
});

test('transfer paths reject absolute and parent traversal forms', () => {
  const [request] = pair('connector', 'download');
  for (const path of ['/etc/file', '../file', 'owned/../file', 'C:\\file', '..\\file']) {
    assert.throws(() => validate('contract-request', { ...request, input: { ...request.input, path } }), /validation_failed/);
  }
});

const hook = read('hook-observation');
const enrollment = Object.fromEntries(['providerId', 'runId', 'requestGeneration', 'workspaceId', 'sessionId', 'turnId'].map(k => [k, hook[k]]));

test('raw hooks, forged approval and missing correlation cannot enter the observation store', () => {
  const db = new DatabaseSync(':memory:'); openHookStore(db);
  assert.throws(() => recordHook(db, { hook_event_name: 'Stop' }, enrollment), /validation_failed/);
  assert.throws(() => recordHook(db, { ...hook, kind: 'plan.approved' }, enrollment), /validation_failed/);
  assert.throws(() => recordHook(db, { ...hook, approved: true }, enrollment), /validation_failed/);
  assert.throws(() => recordHook(db, { ...hook, requestGeneration: 2 }, enrollment), /identity_mismatch/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM observations').get().n, 0);
  db.close();
});

test('hook receipt is committed before acknowledgement; duplicates survive process loss of the reply', () => {
  const dir = mkdtempSync(join(tmpdir(), 'labstride-hook-fixture-'));
  const file = join(dir, 'observations.sqlite');
  try {
    const helper = new URL('../tools/conformance/hook-store.mjs', import.meta.url).href;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import {DatabaseSync} from 'node:sqlite';
      import {openHookStore,recordHook} from ${JSON.stringify(helper)};
      const db=new DatabaseSync(${JSON.stringify(file)});openHookStore(db);
      recordHook(db,${JSON.stringify(hook)},${JSON.stringify(enrollment)});
      process.kill(process.pid,'SIGKILL');
    `], { encoding: 'utf8', timeout: 15000 });
    assert.equal(child.signal, 'SIGKILL', child.stderr);
    const db = new DatabaseSync(file); openHookStore(db);
    const ack = recordHook(db, Object.fromEntries(Object.entries(hook).reverse()), enrollment);
    assert.equal(ack.outcome, 'duplicate'); assert.equal(ack.persistence, 'durable');
    assert.equal(db.prepare('SELECT count(*) AS n FROM observations').get().n, 1);
    assert.throws(() => recordHook(db, { ...hook, kind: 'turn.started' }, enrollment), /conflicting_event/);
    assert.equal(db.prepare('SELECT count(*) AS n FROM observations').get().n, 1);
    db.close();
  } finally { rmSync(dir, { recursive: true }); }
});

test('success acknowledgement cannot claim volatile persistence', () => {
  const ack = read('hook-ack'); ack.persistence = 'not_stored';
  assert.throws(() => validate('hook-ack', ack), /validation_failed/);
});
