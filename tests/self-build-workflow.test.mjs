import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { workspaceFixture } from './helpers/workspace-fixture.mjs';
import { githubFixture, localAuthority, context } from './helpers/github-fixture.mjs';
import { WorkspaceRegistry } from '../packages/target-helper/workspaces.ts';
import { workspaceStart } from '../packages/storage-sqlite/workflows.ts';
import { createSelfBuildAction } from '../packages/operations/self-build.ts';
import { createControlWorker } from '../packages/core/control-worker.ts';
import { createWorker, actionKey } from '../packages/core/worker.ts';
import { createObservationWorker } from '../packages/core/observation-worker.ts';
import { createGitHubProjection } from '../packages/provider-github/projection.ts';
import { loadExtension, freezeProfile } from '../packages/extensions/loader.ts';
import { runGit } from '../packages/target-helper/workspace-git.ts';

// Real checkout, bundle verification, local Git push and SQLite sequencing.
// GitHub and Codex wire responses are controlled peers, not live qualification.
async function setup(t, { losePrReply = false, loseStartReply = false, supported = true } = {}) {
  const source = workspaceFixture(t); source.policy.installationId = 'installation-a'; source.policy.targetId = 'target-a';
  const registry = new WorkspaceRegistry(source.policy, source.dependencies); t.after(() => registry.close());
  const options = { sourceRoot: source.policy.roots[0].path, rootId: 'source', baseBranch: 'main', requiredWorkflows: ['.github/workflows/labstride.yml'],
    agent: { bridgeSocket: '/unused', backendIdentity: 'test', backendVersion: '0.163.0', checkedDelivery: true,
      defaults: { aiMode: 'mode-plan', model: 'model-test', reasoning: 'reason-medium' },
      runtimeValues: { aiMode: { 'mode-plan': 'plan', 'mode-none': 'none' }, model: { 'model-test': 'test-model' }, reasoning: { 'reason-medium': 'medium' } } } };
  const pins = [];
  const f = await githubFixture(t, { native: true, configure(f) {
    f.source = source.operation.source; f.config.github.repositories = [f.source.repository]; f.config.controls = {};
    f.dependencies.host.permissions.push('session.manage');
    for (const [name, value] of Object.entries({ aiMode: 'mode-plan', model: 'model-test', reasoning: 'reason-medium' })) {
      f.config.fields[name] = { source: 'organization_issue_field', scopeId: 'scope-a', fieldId: name, type: 'single-select', options: { default: value } };
      f.descriptors[name] = { ...f.descriptors['status-a'], fieldId: name, source: 'organization_issue_field', credentialRef: 'secret:repository', optionIds: [value] };
    }
    f.config.fields.aiMode.options.none = 'mode-none'; f.descriptors.aiMode.optionIds.push('mode-none');
    f.config.fields.session = { source: 'organization_issue_field', scopeId: 'scope-a', fieldId: 'session', type: 'string' };
    f.descriptors.session = { ...f.descriptors['note-a'], fieldId: 'session', scopeId: 'scope-a', source: 'organization_issue_field' };
    f.config.projections = [
      { fact: 'workspace.ready', field: 'status', value: 'busy' },
      { fact: 'workspace.ready', field: 'session', value: 'registered-checkout' },
      { fact: 'self-build.session-ready', field: 'session', valueFrom: { kind: 'session-id' } },
      ...['planning','waiting-accept','working','testing','review'].map(name => ({ fact: `self-build.${name}`, field: 'status', value: 'busy' })),
    ];
    for (const packageName of ['action-workspace-create', 'action-self-build']) {
      const artifactPath = join(f.root, packageName + '.json');
      execFileSync(process.execPath, ['scripts/package_extension.mjs', 'packages/' + packageName, artifactPath]);
      const metadata = JSON.parse(readFileSync(artifactPath)).manifest;
      pins.push({ id: metadata.id, version: metadata.version, kind: 'action', artifactPath,
        integrity: createHash('sha256').update(readFileSync(artifactPath)).digest('hex'), permissions: metadata.permissions, capabilities: metadata.capabilities,
        configuration: packageName === 'action-self-build' ? options : {} });
    }
    f.dependencies.lock.extensions = f.dependencies.lock.extensions.filter(pin => pin.kind !== 'action').concat(pins);
    f.config.workflows.prepare = [
      { id: 'checkout', action: 'labstride.workspace-create', inputs: { target: 'target-a', rootId: 'source', source: 'context.source' } },
      { id: 'coding', action: 'labstride.self-build', inputs: { schemaVersion: '1.0', target: 'target-a', workspaceId: 'context.workspaceId' } },
    ];
  }, buildPlan(_f, compiled) { return (steps, observed) => workspaceStart(compiled, steps, observed); } });
  f.item.fields.session = { present: false };
  for (const name of ['aiMode','model','reasoning']) f.item.fields[name] = { present: true, value: options.agent.defaults[name] };
  await f.worker.tick(); f.advance(); f.change(); await f.worker.tick();
  const run = f.store.runs()[0]; assert(run);
  const loaded = await loadExtension(freezeProfile(run.id, f.compiled.snapshot.digest, pins[0], f.dependencies.host), f.dependencies.host, {
    target: { async binding() { return { installationId: 'installation-a', revision: 1 }; }, async validate() {}, async invoke(request) { return registry.handle(request); } },
  });
  const checkoutWorker = createWorker(f.store, { executorId: 'checkout', nextAttempt: () => crypto.randomUUID(), adapters: new Map([[actionKey(pins[0].id, pins[0].version), loaded.instance]]) });
  await checkoutWorker.tick(); await checkoutWorker.drain();
  const workspace = f.store.workspace(run.id), cwd = join(options.sourceRoot, workspace.locator, 'source');
  f.store.advanceWorkflows(f.dependencies.host); assert.equal(f.store.operations(run.id).length, 2);
  const op = f.store.operations(run.id)[1].request, state = { starts: 0, turns: 0, latest: { id: 'initial', status: 'completed' }, report: null, creates: 0, pr: null, loss: losePrReply, startLoss: loseStartReply };
  const remote = join(source.root, 'published.git'); runGit(source.root, ['init', '--bare', '--template=', remote]);
  const branchSha = () => runGit(remote, ['rev-parse', `refs/heads/${workspace.branch}`]);
  const git = args => runGit(cwd, ['-c', `safe.directory=${cwd}`, ...args]);
  const bridge = { async call(request) {
    if (request.method === 'catalog') return { models: [{ model: 'test-model', reasoning: supported ? ['medium'] : [] }] };
    if (request.method === 'start') { state.starts++; if (state.startLoss) throw Error('transport_unknown'); return { thread: { id: 'original-session', cwd } }; }
    if (request.method === 'turn') { state.turns++; assert.equal(request.parameters.mode, 'plan'); return { turn: state.latest }; }
    if (request.method === 'observe') return { sessionId: 'original-session', path: cwd, state: 'idle', turn: state.latest, report: state.report };
    if (request.method === 'bundle') {
      const path = join(source.root, 'result.bundle'); git(['bundle','create',path,'HEAD']);
      return { sha: git(['rev-parse','HEAD']), branch: workspace.branch, baseSha: source.operation.source.sha, bundle: readFileSync(path).toString('base64') };
    }
    throw Error('unexpected_bridge_request');
  } };
  const rest = { reference: 'secret:repository', credential: async () => 'synthetic', async request(method, path, input) {
    if (path.includes('/git/ref/')) return { object: { sha: branchSha() } };
    if (method === 'POST' && path.endsWith('/pulls')) {
      state.creates++; state.pr = { number: 42, node_id: 'pull-42', state: 'open', body: input.body, title: input.title, draft: true,
        head: { sha: branchSha(), repo: { node_id: source.operation.source.repositoryId } }, base: { ref: 'main' }, html_url: 'https://github.com/example/source/pull/42' };
      if (state.loss) { state.loss = false; throw Error('transport_unknown'); } return state.pr;
    }
    if (path.includes('/pulls')) { if (state.pr) state.pr.head.sha = branchSha(); return path.includes('?') ? state.pr ? [state.pr] : [] : state.pr; }
    if (path.includes('/actions/runs')) return { workflow_runs: [{ id: 1, check_suite_id: 7, path: options.requiredWorkflows[0], head_sha: branchSha(), event: 'pull_request', status: 'completed', conclusion: 'success' }] };
    if (path.includes('/check-runs')) return { check_runs: [{ id: 1, head_sha: branchSha(), check_suite: { id: 7 }, name: 'verify', app: { id: 1 }, status: 'completed', conclusion: 'success' }] };
    if (path.includes('/statuses')) return [];
    throw Error('unexpected_rest_request');
  } };
  const client = { async query(query) {
    if (query.includes('LabstrideCodingTask')) return { node: { title: 'Implement issue', body: 'Task data', url: 'https://github.com/example/source/issues/1', state: 'OPEN' } };
    if (query.includes('LabstrideIssueLink')) return { node: { url: 'https://github.com/example/source/issues/1' } };
    if (query.includes('LabstrideReady')) { state.pr.draft = false; return {}; }
    throw Error('unexpected_graphql_query');
  } };
  const provider = { ...f.adapter, withConfiguration() { return this; }, async describeField(field) { return f.descriptors[field.fieldId]; },
    async setField(_scope, _item, fieldId, _type, value) {
      const name = Object.keys(f.config.fields).find(name => f.config.fields[name].fieldId === fieldId);
      f.item.fields[name] = { present: true, value }; f.advance(1000); f.item.updatedAt = f.now();
    } };
  const observer = createObservationWorker(f.store, { sessions: new Map(), projections: new Map([['test.provider', createGitHubProjection(f.store, provider)]]) });
  const publicationGit = (path, args, access) => args[0] === 'push' ? runGit(path, ['-c','protocol.file.allow=always','push', '--porcelain', remote, args.at(-1)]) : runGit(path, args, access);
  const action = createSelfBuildAction(f.store, options, provider, client, rest, bridge, publicationGit);
  const worker = createWorker(f.store, { executorId: 'coding', nextAttempt: () => crypto.randomUUID(), adapters: new Map([[actionKey(op.actionId, op.actionVersion), action]]) });
  const tick = async () => { f.advance(20000); await worker.tick(); await worker.drain(); await f.worker.tick(); await observer.tick(); };
  function commit(file, message = 'Implement issue') {
    writeFileSync(join(cwd, file), 'implemented\n'); git(['add', file]);
    git(['-c','user.name=Test','-c','user.email=test@example.test','commit','--signoff','-m',message]);
    state.latest = { id: 'human-' + file.replaceAll('.', '-'), status: 'completed' };
    state.report = { schemaVersion: '1.0', runId: run.id, sessionId: 'original-session', turnId: state.latest.id, commitSha: git(['rev-parse','HEAD']), status: 'ready', summary: 'Actual commit', prTitle: message, prBody: 'Verified tests', issueComplete: true };
  }
  return { ...f, run, op, state, cwd, tick, commit, action, provider, observer, branchSha };
}

test('checkout advances to the original Plan session and publishes follow-up commits to the same review PR', async t => {
  const f = await setup(t); for (let i = 0; i < 8 && !f.state.turns; i++) await f.tick();
  assert.equal(f.state.starts, 1); assert.equal(f.state.turns, 1);
  assert.equal(f.store.managedSession(f.run.id).sessionId, 'original-session');
  f.commit('first.txt'); await f.tick(); await f.tick();
  assert.equal(f.state.creates, 1, JSON.stringify({diagnostic:f.store.workflowDiagnostic(f.run.id),operations:f.store.controlStatus(f.run.id).operations})); assert.equal(f.state.pr.draft, false); assert.equal(f.state.pr.head.sha, f.state.report.commitSha);
  f.state.pr.title = 'Human review title'; f.commit('second.txt'); await f.tick(); await f.tick();
  assert.equal(f.state.creates, 1, JSON.stringify({diagnostic:f.store.workflowDiagnostic(f.run.id),operations:f.store.controlStatus(f.run.id).operations})); assert.equal(f.state.pr.title, 'Human review title'); assert.equal(f.branchSha(), f.state.report.commitSha);
  assert.equal(f.store.managedProjectionDiagnostics(f.run.id).length, 0);
  assert.equal(f.store.get('operation', f.op.operationId).state, 'running');
  assert.equal(f.state.starts, 1); assert.equal(f.state.turns, 1);
});

test('a lost PR creation response remains unknown without creating a second PR', async t => {
  const f = await setup(t, { losePrReply: true }); for (let i = 0; i < 8 && !f.state.turns; i++) await f.tick(); f.commit('lost.txt');
  await f.tick(); await f.tick(); await f.tick();
  assert.equal(f.state.creates, 1, JSON.stringify({diagnostic:f.store.workflowDiagnostic(f.run.id),operations:f.store.controlStatus(f.run.id).operations})); assert.equal(f.store.workflowDiagnostic(f.run.id), 'outcome_unknown');
  assert.equal(f.store.get('operation', f.op.operationId).state, 'outcome_unknown');
});


test('a lost native start reply keeps its frozen Plan choice despite later No agent fields and never starts again', async t => {
  const f = await setup(t, { loseStartReply: true });
  for (let i = 0; i < 8 && !f.state.starts; i++) await f.tick();
  assert.equal(f.state.starts, 1); assert.equal(f.store.managedSessionStart(f.op.operationId).mode, 'plan');
  f.item.fields.aiMode = { present: true, value: 'mode-none' };
  await f.tick(); await f.tick();
  assert.equal(f.state.starts, 1); assert.equal(f.state.turns, 0); assert.equal(f.store.managedSession(f.run.id), null);
  assert.equal(f.store.get('operation', f.op.operationId).state, 'outcome_unknown');
  assert.equal((await f.action.cancel(f.op, null, 'cancel-unknown')).result.status, 'accepted');
});

test('unsupported startup choices create no native intent and operator cancellation releases the retained workspace', async t => {
  const f = await setup(t, { supported: false });
  for (let i = 0; i < 6; i++) await f.tick();
  assert.equal(f.state.starts, 0); assert.equal(f.store.hasManagedEffect(f.op.operationId, 'thread-start'), false);
  assert.equal(f.store.workflowDiagnostic(f.run.id), 'unsupported_agent_choice');
  const run = f.store.get('run', f.run.id);
  f.store.cancelRun({ schemaVersion: '1.0', id: 'cancel-unsupported-start', runId: run.id, expectedRevision: run.revision, command: 'cancel' }, context, localAuthority);
  const controls = createControlWorker(f.store, { executorId: 'test-cancel', nextAttempt: () => crypto.randomUUID(), adapters: new Map([[actionKey(f.op.actionId, f.op.actionVersion), f.action]]) });
  await controls.tick(); await controls.drain();
  assert.equal(f.store.get('run', run.id).state, 'cancelled'); assert.equal(f.store.workspace(run.id).keep, true);
  assert.equal(f.state.starts, 0);
});
