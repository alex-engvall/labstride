import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { configurationFixture, observation, planFor, context, localAuthority, policyDependencies, publishFixturePolicy } from './configuration-fixture.mjs';
import { startCoordinator } from '../../apps/coordinator/main.ts';
import { configuredMergeAction } from '../../packages/github-merge/action.ts';
import { GitHubMergeProvider } from '../../packages/provider-github/merges.ts';
import { mergeResource } from '../../packages/core/merges.ts';
import { createWorker, actionKey } from '../../packages/core/worker.ts';
import { mergeTarget } from './merge-target.mjs';

export async function mergeFixture(t, { prepared = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'labstride-merge-')), state = join(root, 'coordinator');
  let store;
  t.after(() => { store?.close(); rmSync(root, { recursive: true, force: true }); });
  const f = configurationFixture(root), e = { schemaVersion: '1.0', repository: { name: f.source.repository, nodeId: f.source.repositoryId, id: 1001 },
    targetId: 'target-a', baseBranch: 'main', method: 'merge', credentialRef: 'secret:repository', protectionCredentialRef: 'secret:project',
    appId: 123, installationId: 456, actorId: 789, checks: [{ context: 'build', appId: 15368 }, { context: 'DCO', appId: 927 }],
    workflows: [{ id: 201, path: '.github/workflows/ci.yml', blobSha: 'f'.repeat(40), appId: 15368 }],
    downstream: { id: 202, path: '.github/workflows/downstream.yml', blobSha: 'f'.repeat(40), appId: 15368 },
    qualification: { mergeSha: 'd'.repeat(40), pullRequest: 10, runId: 41 } };
  const artifactPath = join(root, 'merge.json');
  const packed = spawnSync(process.execPath, ['scripts/package_extension.mjs', 'packages/action-github-merge', artifactPath], { encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr);
  const pin = { id: 'labstride.github-merge', version: '1.0.0', kind: 'action', artifactPath, integrity: createHash('sha256').update(readFileSync(artifactPath)).digest('hex'),
    permissions: ['network.github'], capabilities: ['merge.current-revision.v1'], configuration: { enrollments: { selected: e } } };
  f.dependencies.lock.extensions.push(pin);
  const input = { schemaVersion: '1.0', enrollment: 'selected', target: 'target-a', source: f.source, pullRequest: 11, expectedHead: f.source.sha };
  f.config.workflows.prepare = [{ id: 'merge', action: pin.id, inputs: { ...input, source: 'context.source' } }];
  const c = await f.compile(); assert.equal(c.ok, true, JSON.stringify(c.diagnostics));
  const compiled = c.configuration; let now = '2026-10-24T12:00:00.000Z';
  const dependencies = { ...policyDependencies, clock: { now: () => now } };
  store = startCoordinator(state, dependencies).store;
  store.activateConfiguration(compiled, null, context, localAuthority); publishFixturePolicy(store, f, compiled);
  function admit(suffix = '') {
    const observed = observation(f, compiled); observed.event.subjectId += suffix; observed.event.externalId += suffix; observed.event.eventId += suffix;
    const builder = planFor(f, compiled, suffix);
    const admitted = store.requestConfiguredStart(compiled, observed, { source: f.source }, (steps, observed) => {
      const plan = builder(steps, observed); plan.resourceKey = mergeResource(e); return plan;
    }, context);
    assert.equal(admitted.evaluation.outcome, 'matched');
    return store.operations(admitted.runId)[0].request;
  }
  const op = admit();
  const target = await mergeTarget(t, root, e, f.source.sha);
  const identity = () => ({ appId: e.appId, installationId: e.installationId, repositoryIds: [e.repository.id], contents: 'write' });
  const provider = new GitHubMergeProvider({ credential: async reference => reference, identity, fetch: target.transport });
  const adapter = () => configuredMergeAction(store, f.dependencies.host, provider);
  const worker = () => createWorker(store, { executorId: 'merge-test', nextAttempt: () => 'attempt-1', adapters: new Map([[actionKey(pin.id, pin.version), adapter()]]) });
  if (!prepared) { const claim = store.claim(op.operationId, 'merge-test', 'attempt-1'); store.beginEffect(claim); }
  return { root, state, f, e, input, pin, compiled, dependencies, target, provider, op, admit, adapter, worker,
    get store() { return store; }, setNow(value) { now = value; },
    advance() { now = new Date(Date.parse(now) + 60001).toISOString(); },
    close() { store.close(); store = null; },
    reopen() { store = startCoordinator(state, dependencies).store; return store; },
  };
}
