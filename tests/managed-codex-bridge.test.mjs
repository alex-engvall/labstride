import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexBridge } from '../packages/operations/bridge.ts';
import { workspaceFixture } from './helpers/workspace-fixture.mjs';
import { WorkspaceRegistry } from '../packages/target-helper/workspaces.ts';
import { digest } from '../packages/configuration/json.ts';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function fixture(t) {
  const f = workspaceFixture(t), registry = new WorkspaceRegistry(f.policy, f.dependencies); t.after(() => registry.close());
  const response = await registry.handle(f.request), receipt = response.workspace;
  assert.equal(response.outcome, 'ok');
  const binding = { runId: receipt.runId, workspaceId: receipt.workspaceId, path: f.sourcePath(receipt), receiptDigest: digest(receipt) };
  const requests = [], state = { latest: null, items: [], version: '0.163.0', cwd: binding.path };
  const rpc = { onNotification() {}, onDisconnect() {}, notify() {}, frame() {}, close() {}, async call(method, params) {
    requests.push({ method, params });
    if (method === 'initialize') return { userAgent: `codex/${state.version} linux` };
    if (method === 'model/list') return { data: [{ model: 'test-model', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }] }] };
    if (method === 'thread/start' || method === 'thread/read' || method === 'thread/resume') return { thread: { id: 'managed-thread', cwd: state.cwd, source: 'cli', historyMode: 'legacy', preview: '', status: { type: state.latest?.status === 'inProgress' ? 'active' : 'idle' } } };
    if (method === 'thread/turns/list' && state.historyError) {
      if (state.activityDuringHistory) rpc.onNotification({ method: 'item/started', params: { threadId: 'managed-thread' } });
      throw Object.assign(new Error('rpc_rejected'), { rpcError: state.historyError });
    }
    if (method === 'thread/turns/list') return { data: state.latest ? [{ ...state.latest, ...(params.itemsView === 'full' ? { itemsView: 'full', items: state.items.filter(x => x.turnId === state.latest.id).map(x => x.item) } : {}) }] : [] };
    if (method === 'turn/start') { state.latest = { id: 'initial-turn', status: 'inProgress' }; return { turn: state.latest }; }
    if (method === 'thread/items/list') return { data: state.items, nextCursor: null };
    if (method === 'turn/interrupt') { state.latest.status = 'interrupted'; return {}; }
    throw Error('unexpected_method');
  } };
  const bridge = createCodexBridge({ schemaVersion: '1.0', socket: join(f.root, 'bridge.sock'), backendSocket: join(f.root, 'backend.sock'), backendVersion: '0.163.0',
    sourceRoot: f.policy.roots[0].path, helperUid: process.getuid(), stateDirectory: f.root }, rpc);
  return { ...f, receipt, binding, requests, state, bridge, rpc };
}

test('managed bridge validates original filesystem receipt and starts one configured native thread', async t => {
  const f = await fixture(t);
  const started = await f.bridge.call({ schemaVersion: '1.0', method: 'start', binding: f.binding, parameters: { model: 'test-model' } });
  assert.equal(started.thread.id, 'managed-thread');
  const request = f.requests.find(request => request.method === 'thread/start');
  assert.equal(request.params.historyMode, 'legacy');
  assert.equal(request.params.allowProviderModelFallback, false); assert.equal(request.params.sandbox, 'workspace-write');
  assert.equal(request.params.dynamicTools[0].name, 'labstride_report');
  await assert.rejects(f.bridge.call({ schemaVersion: '1.0', method: 'start', binding: { ...f.binding, receiptDigest: '0'.repeat(64) }, parameters: { model: 'test-model' } }), /identity_mismatch/);
  assert.equal(f.requests.filter(request => request.method === 'thread/start').length, 1);
});

test('checked initial delivery preserves native Plan mode and refuses later automatic instructions', async t => {
  const f = await fixture(t);
  const request = { schemaVersion: '1.0', method: 'turn', binding: f.binding, sessionId: 'managed-thread', parameters: { expectedTurnId: null, prompt: 'Task data', model: 'test-model', reasoning: 'medium', mode: 'plan' } };
  await f.bridge.call(request);
  assert.deepEqual(f.requests.find(request => request.method === 'turn/start').params.collaborationMode, { mode: 'plan', settings: { model: 'test-model', reasoning_effort: 'medium', developer_instructions: null } });
  f.state.latest = { id: 'human-turn', status: 'completed' };
  await assert.rejects(f.bridge.call(request), /stale_revision/);
  assert.equal(f.requests.filter(request => request.method === 'turn/start').length, 1);
  await f.bridge.call({ schemaVersion: '1.0', method: 'observe', binding: f.binding, sessionId: 'managed-thread' });
  assert.deepEqual(f.requests.find(request => request.method === 'thread/resume').params, { threadId: 'managed-thread', excludeTurns: true });
});

test('only a completed native main-thread report in the latest completed turn is returned', async t => {
  const f = await fixture(t); f.state.latest = { id: 'human-approved-work', status: 'completed' };
  const report = { schemaVersion: '1.0', status: 'ready', commitSha: 'a'.repeat(40), summary: 'Done', prTitle: 'Implement task', prBody: 'Actual validation evidence', issueComplete: true };
  const item = { type: 'dynamicToolCall', id: 'call-1', tool: 'labstride_report', status: 'completed', success: true, arguments: report };
  f.state.items = [{ turnId: 'older-turn', item }, { turnId: f.state.latest.id, item }];
  const observed = await f.bridge.call({ schemaVersion: '1.0', method: 'observe', binding: f.binding, sessionId: 'managed-thread' });
  assert.equal(observed.report.turnId, f.state.latest.id); assert.equal(observed.report.runId, f.binding.runId);
  f.state.items = [{ turnId: f.state.latest.id, item: { ...item, success: false } }];
  assert.equal((await f.bridge.call({ schemaVersion: '1.0', method: 'observe', binding: f.binding, sessionId: 'managed-thread' })).report, null);
  f.state.latest.status = 'inProgress'; f.state.items[0].item.success = true;
  assert.equal((await f.bridge.call({ schemaVersion: '1.0', method: 'observe', binding: f.binding, sessionId: 'managed-thread' })).report, null);
});

test('backend mismatch and foreign session paths fail before native mutation', async t => {
  const f = await fixture(t); f.state.version = '0.157.1';
  await assert.rejects(f.bridge.call({ schemaVersion: '1.0', method: 'start', binding: f.binding, parameters: { model: 'test-model' } }), /backend_version_mismatch/);
  assert.equal(f.requests.some(request => request.method === 'thread/start'), false);
});

test('real shallow workspace commits export a credential-free bundle without executing source hooks in the coordinator', async t => {
  const f = await fixture(t), git = args => execFileSync('/usr/bin/git', ['-c', `safe.directory=${f.binding.path}`, '-c', 'core.hooksPath=/dev/null', ...args], { cwd: f.binding.path, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  writeFileSync(join(f.binding.path, 'new.txt'), 'implemented\n'); git(['add', 'new.txt']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'Implement bounded task']);
  const sha = git(['rev-parse', 'HEAD']);
  const exported = await f.bridge.call({ schemaVersion: '1.0', method: 'bundle', binding: f.binding, parameters: { sha } });
  const temp = mkdtempSync(join(tmpdir(), 'labstride-bundle-verify-')); t.after(() => rmSync(temp, { recursive: true, force: true }));
  writeFileSync(join(temp, 'source.bundle'), Buffer.from(exported.bundle, 'base64'));
  const bare = join(temp, 'objects.git'); execFileSync('/usr/bin/git', ['init', '--bare', '--template=', bare], { stdio: 'ignore' });
  execFileSync('/usr/bin/git', ['bundle', 'verify', join(temp, 'source.bundle')], { cwd: bare, stdio: 'ignore' });
  execFileSync('/usr/bin/git', ['fetch', join(temp, 'source.bundle'), 'HEAD'], { cwd: bare, stdio: 'ignore' });
  assert.equal(execFileSync('/usr/bin/git', ['rev-parse', 'FETCH_HEAD'], { cwd: bare, encoding: 'utf8' }).trim(), sha);
  writeFileSync(join(f.binding.path, 'dirty.txt'), 'preserved');
  await assert.rejects(f.bridge.call({ schemaVersion: '1.0', method: 'bundle', binding: f.binding, parameters: { sha } }), /checkout_not_publishable/);
});

const initial = f => ({ schemaVersion: '1.0', method: 'turn', binding: f.binding, sessionId: 'managed-thread', parameters: { expectedTurnId: null, prompt: 'Task data', model: 'test-model', reasoning: 'medium', mode: 'plan' } });
const unmaterialized = { code: -32600, message: 'thread managed-thread is not materialized yet; thread/turns/list is unavailable before first user message' };

test('a witnessed newly created legacy thread accepts one initial turn before rollout materialization', async t => {
  const f = await fixture(t);
  await f.bridge.call({ schemaVersion: '1.0', method: 'start', binding: f.binding, parameters: { model: 'test-model' } });
  f.rpc.onNotification({ method: 'mcpServer/startupStatus/updated', params: { threadId: 'managed-thread', status: 'starting' } });
  f.rpc.onNotification({ method: 'thread/readState/changed', params: { threadId: 'managed-thread' } });
  f.state.historyError = unmaterialized;
  await f.bridge.call(initial(f));
  assert.equal(f.requests.filter(r => r.method === 'turn/start').length, 1);
  await assert.rejects(f.bridge.call(initial(f)), /rpc_rejected/);
  assert.equal(f.requests.filter(r => r.method === 'turn/start').length, 1);
});

test('unavailable history is never empty without a fresh creation witness, after disconnect or during human activity', async t => {
  for (const scenario of ['existing', 'disconnected', 'human', 'settings', 'queue']) {
    const f = await fixture(t);
    if (scenario !== 'existing') await f.bridge.call({ schemaVersion: '1.0', method: 'start', binding: f.binding, parameters: { model: 'test-model' } });
    if (scenario === 'disconnected') f.rpc.onDisconnect();
    if (scenario === 'settings' || scenario === 'queue') f.rpc.onNotification({ method: scenario === 'settings' ? 'thread/settings/updated' : 'thread/queue/changed', params: { threadId: 'managed-thread' } });
    f.state.historyError = unmaterialized;
    if (scenario === 'human') f.state.activityDuringHistory = true;
    await assert.rejects(f.bridge.call(initial(f)), /rpc_rejected|stale_revision/);
    assert.equal(f.requests.some(r => r.method === 'turn/start'), false);
  }
});

test('missing methods, generic history errors and foreign unmaterialized IDs never permit initial delivery', async t => {
  for (const error of [{ code: -32601, message: 'list_turns is not supported yet' }, { code: -32600, message: 'unavailable' }, { ...unmaterialized, message: unmaterialized.message.replace('managed-thread', 'foreign-thread') }]) {
    const f = await fixture(t);
    await f.bridge.call({ schemaVersion: '1.0', method: 'start', binding: f.binding, parameters: { model: 'test-model' } });
    f.state.historyError = error;
    await assert.rejects(f.bridge.call(initial(f)), /rpc_rejected/);
    assert.equal(f.requests.some(r => r.method === 'turn/start'), false);
  }
});

test('a creation-time human event remains disqualifying when observation capacity overflows', async t => {
  const f = await fixture(t), original = f.rpc.call;
  f.rpc.call = async (method, parameters) => {
    if (method === 'thread/start') {
      f.rpc.onNotification({ method: 'turn/started', params: { threadId: 'managed-thread' } });
      for (let i = 0; i < 4096; i++) f.rpc.onNotification({ method: 'turn/started', params: { threadId: `other-${i}` } });
    }
    return original(method, parameters);
  };
  await f.bridge.call({ schemaVersion: '1.0', method: 'start', binding: f.binding, parameters: { model: 'test-model' } });
  f.state.historyError = unmaterialized;
  await assert.rejects(f.bridge.call(initial(f)), /rpc_rejected/);
  assert.equal(f.requests.some(r => r.method === 'turn/start'), false);
});

test('a changed latest turn or an incomplete full-view reply cannot supply a report', async t => {
  for (const change of ['turn', 'view']) {
    const f = await fixture(t); f.state.latest = { id: 'completed-turn', status: 'completed' };
    const original = f.rpc.call;
    f.rpc.call = async (method, params) => {
      const value = await original(method, params);
      if (method === 'thread/turns/list' && params.itemsView === 'full') {
        if (change === 'turn') value.data[0].id = 'later-human-turn';
        else value.data[0].itemsView = 'summary';
      }
      return value;
    };
    await assert.rejects(f.bridge.call({ schemaVersion: '1.0', method: 'observe', binding: f.binding, sessionId: 'managed-thread' }), /stale_revision/);
  }
});
