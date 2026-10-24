import test from 'node:test';
import assert from 'node:assert/strict';
import { fork, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { workflowFixture } from './helpers/workflow-fixture.mjs';
import { configuredWorkflowAction } from '../packages/workflow-broker/action.ts';
import { localJsonObserver } from '../packages/workflow-broker/local-observer.ts';
import { deploymentId, observerKey, recoveryDetails } from '../packages/core/deployments.ts';
import { workflowResource } from '../packages/core/workflow-broker.ts';
import { claimOperation, executeClaim } from '../tools/workflow-runner/client.mjs';
import { validated } from '../packages/storage-sqlite/validation.ts';
import { startExecution } from '../apps/coordinator/runtime.ts';

const message = async child => (await once(child, 'message', { signal: AbortSignal.timeout(10000) }))[0];
function child(t, file, args) {
  const process = fork(new URL(`./helpers/${file}`, import.meta.url), args, { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  process.done = once(process, 'exit');
  t.after(async () => { if (process.exitCode === null && process.signalCode === null) { process.kill('SIGKILL'); await process.done; } });
  return process;
}
function profile(endpoint) {
  return { schemaVersion: '1.0', recipe: { id: 'example.release', version: '1.0.0', digest: 'e'.repeat(64) },
    observer: { id: 'labstride.observer.local-json', version: '1.0.0', configuration: { endpoint } },
    observationTimeoutMs: 1000, maxObservationAgeMs: 30000,
    recovery: { methods: ['manual', 'forward_fix'], steps: ['Inspect the original target and authorize a separate forward fix.'],
      migration: { strategy: 'irreversible', limits: ['Switching the application release cannot undo database migrations.'] },
      rollback: { supported: false, qualification: null } } };
}
async function fixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'labstride-deployment-')), path = join(root, 'target.sqlite');
  const target = child(t, 'deployment-target.mjs', [path]), { url } = await message(target);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const observer = localJsonObserver(), observers = new Map([[observerKey(observer.id, observer.version), observer]]);
  const deployment = profile(url + '/state');
  if (options.profile) options.profile(deployment);
  const x = await workflowFixture(t, { ...options, deployment, observers: options.missingObserver ? new Map() : observers });
  const adapter = () => configuredWorkflowAction(x.store, x.f.dependencies.host, x.provider, observers);
  return { ...x, get store() { return x.store; }, adapter, observers, deployment,
    async configure(patch = {}, responseMode = 'normal') { const reply = message(target); target.send({ patch, responseMode }); await reply; },
    effects() { const db = new DatabaseSync(path, { readOnly: true }); try { return db.prepare('SELECT count(*) AS n FROM effects').get().n; } finally { db.close(); } },
    async deliver() {
      const bound = await claimOperation(x.runnerOptions);
      const receipt = await executeClaim(x.runnerOptions, bound, { observeSource() {
        if (!options.checkoutSource) return x.op.source.sha;
        const result = spawnSync('git', ['-C', join(x.root, 'application'), 'rev-parse', 'HEAD'], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
      },
        async effect({ operation }) {
          const response = await fetch(url + '/deploy', { method: 'POST', body: JSON.stringify({ operationId: operation.operationId,
            targetId: operation.targetId, environment: x.enrollment.environment, resourceId: 'local-release', sourceRepositoryId: operation.source.repositoryId,
            sourceSha: operation.source.sha, health: 'healthy', observedAt: x.now() }) });
          assert.equal(response.status, 200);
          // These outputs deliberately cannot prove independent health/revision.
          return { conclusion: 'succeeded', resources: [], outputs: { health: 'healthy', revision: operation.source.sha, deploymentVerified: true } };
        } });
      x.runs[0].status = 'completed'; x.runs[0].conclusion = 'success';
      return { bound, receipt };
    },
    async explicitRecovery(sourceSha) {
      // A separate operator-controlled target effect, outside the coordinator's
      // observer registry. Its identity cannot replay the original operation.
      const response = await fetch(url + '/deploy', { method: 'POST', body: JSON.stringify({ operationId: 'operator-recovery',
        targetId: x.op.targetId, environment: x.enrollment.environment, resourceId: 'local-release', sourceRepositoryId: x.op.source.repositoryId,
        sourceSha, health: 'healthy', observedAt: x.now() }) });
      assert.equal(response.status, 200);
    },
    async accept(result) {
      x.store.markUnknown(x.op.operationId);
      const operation = x.store.get('operation', x.op.operationId);
      return x.store.acceptResult(result, null, operation.revision, [], x.store.recoveryEpoch());
    },
  };
}
function active(x) { return x.store.db.prepare('SELECT active FROM workflow_dispatches WHERE operation_id=?').get(x.op.operationId).active; }
function state(x) { return x.store.get('deployment', deploymentId(x.op.operationId)).state; }
function noVerified(x) { assert.equal(x.store.snapshot().records.filter(record => record.kind === 'deployment' && record.state === 'verified').length, 0); }

test('matching receipt, exact GitHub attempt and independently read durable target verify atomically', async t => {
  const x = await fixture(t, { checkoutSource: true }); await x.deliver();
  assert.equal(active(x), 1); assert.equal(state(x), 'outcome_unknown');
  const result = await x.adapter().reconcile(x.op, null);
  assert.equal(result.result.status, 'succeeded');
  assert.equal(active(x), 1); noVerified(x); // Staged evidence alone releases nothing.
  assert.equal(await x.accept(result), true);
  assert.equal(state(x), 'verified'); assert.equal(active(x), 0);
  assert.equal(x.store.get('operation', x.op.operationId).state, 'succeeded');
  const evidence = x.store.deploymentEvidence(x.op.operationId).evidence;
  assert.equal(evidence.target.sourceSha, x.op.source.sha); assert.notEqual(evidence.target.sourceSha, evidence.workflow.workflowSha);
  assert.equal(evidence.claim.executor.runAttempt, 1); assert.equal(x.effects(), 1); assert.equal(x.dispatches(), 1);
  const diagnostic = x.store.workflowExecutions(x.op.runId)[0];
  assert.equal(diagnostic.deploymentVerified, true); assert.equal(diagnostic.cleanupBlocked, false);
  await x.restart(); assert.equal(state(x), 'verified'); assert.equal(x.effects(), 1);
});

test('AC16 local: explicit unhealthy target fails and keeps recovery/cleanup blockers even after health recovers', async t => {
  const x = await fixture(t); await x.deliver(); await x.configure({ health: 'unhealthy' });
  const result = await x.adapter().reconcile(x.op, null);
  assert.equal(result.result.status, 'failed'); assert.equal(result.result.outputs.blocker, 'target_unhealthy');
  await x.accept(result);
  assert.equal(state(x), 'failed'); assert.equal(active(x), 1);
  const diagnostic = x.store.workflowExecutions(x.op.runId)[0];
  assert.equal(diagnostic.cleanupBlocked, true); assert.equal(diagnostic.recovery.automaticRollback, false);
  assert.equal(diagnostic.recovery.rollbackQualified, false); assert.equal(diagnostic.recovery.migration.strategy, 'irreversible');
  assert(x.store.db.prepare('SELECT reason FROM resource_holds WHERE resource_key=?').get(workflowResource(x.enrollment)));
  await x.configure({ health: 'healthy' }); await x.restart();
  assert.equal((await x.adapter().reconcile(x.op, null)).result.status, 'failed');
  assert.equal(state(x), 'failed'); noVerified(x); assert.equal(x.effects(), 1);
});

test('durable health failure survives restart before finalization and cannot become a successful deploy', async t => {
  const x = await fixture(t); await x.deliver(); await x.configure({ health: 'unhealthy' });
  const failure = await x.adapter().reconcile(x.op, null);
  assert.equal(failure.result.status, 'failed'); noVerified(x);
  await x.restart(); x.advance(); await x.configure({ health: 'healthy', observedAt: x.now() });
  const result = await x.adapter().reconcile(x.op, null);
  assert.deepEqual(result, failure); await x.accept(result);
  assert.equal(state(x), 'failed'); assert.equal(active(x), 1); noVerified(x); assert.equal(x.effects(), 1);
});

test('unknown and failed deployments cannot advance a configured follow-up action', async t => {
  const x = await fixture(t, { followup: true }); await x.deliver();
  await x.configure({ sourceSha: 'f'.repeat(40) }); await x.accept(await x.adapter().reconcile(x.op, null));
  x.store.advanceWorkflows(x.f.dependencies.host); assert.equal(x.store.operations(x.op.runId).length, 1);
  await x.configure({ health: 'unhealthy' }); await x.accept(await x.adapter().reconcile(x.op, null));
  x.store.advanceWorkflows(x.f.dependencies.host); assert.equal(x.store.operations(x.op.runId).length, 1);
  assert.equal(x.store.get('operation', x.op.operationId).state, 'failed'); assert.equal(active(x), 1);
});

for (const [name, patch, blocker] of [
  ['wrong revision', { sourceSha: 'f'.repeat(40) }, 'target_revision_mismatch'],
  ['unknown revision', { sourceSha: null }, 'target_revision_mismatch'],
  ['wrong target', { targetId: 'foreign' }, 'target_identity_mismatch'],
  ['wrong environment', { environment: 'foreign' }, 'target_identity_mismatch'],
  ['wrong source repository', { sourceRepositoryId: 'foreign' }, 'target_identity_mismatch'],
  ['wrong observation correlation', { observationId: 'foreign' }, 'target_identity_mismatch'],
  ['stale observation', { observedAt: '2020-01-01T00:00:00.000Z' }, 'target_observation_stale'],
  ['future observation', { observedAt: '2030-01-01T00:00:00.000Z' }, 'target_observation_stale'],
  ['unknown health', { health: 'unknown' }, 'target_health_unknown'],
  ['unknown schema', { schemaVersion: '2.0' }, 'target_observation_invalid'],
  ['unknown field', { approved: true }, 'target_observation_invalid'],
]) test(`AC16 local: ${name} preserves uncertainty despite a successful receipt`, async t => {
  const x = await fixture(t); await x.deliver(); await x.configure(patch);
  const result = await x.adapter().reconcile(x.op, null);
  assert.equal(result.result.status, 'outcome_unknown'); assert.equal(result.result.outputs.blocker, blocker);
  await x.accept(result); noVerified(x); assert.equal(active(x), 1); assert.equal(x.effects(), 1);
  assert.equal(x.store.workflowExecutions(x.op.runId)[0].cleanupBlocked, true);
});

for (const mode of ['unavailable', 'malformed', 'oversized', 'redirect']) test(`target transport ${mode} cannot supply verification`, async t => {
  const x = await fixture(t); await x.deliver(); await x.configure({}, mode);
  const result = await x.adapter().reconcile(x.op, null);
  assert.equal(result.result.status, 'outcome_unknown'); await x.accept(result);
  noVerified(x); assert.equal(active(x), 1); assert.equal(x.effects(), 1);
});

test('missing or incompatible observers block before dispatch', async t => {
  const x = await fixture(t, { missingObserver: true });
  assert.equal(x.dispatches(), 0); assert.equal(x.effects(), 0);
  assert.equal(x.store.delivery(`operation:${x.op.operationId}`).state, 'blocked');
  const observer = { ...localJsonObserver(), version: '2.0.0' };
  const adapter = configuredWorkflowAction(x.store, x.f.dependencies.host, x.provider,
    new Map([[observerKey(x.deployment.observer.id, '1.0.0'), observer]]));
  await assert.rejects(adapter.validate(x.op), /unsupported_capability/);
  assert.equal(x.store.workflowDispatch(x.op.operationId), null);
});

test('missing observer after dispatch and a timed-out observer remain read-only uncertainty', async t => {
  const x = await fixture(t, { profile: p => { p.observationTimeoutMs = 10; } }); await x.deliver();
  const missing = configuredWorkflowAction(x.store, x.f.dependencies.host, x.provider);
  assert.equal((await missing.reconcile(x.op, null)).result.status, 'outcome_unknown');
  let aborted = false;
  const observer = { ...localJsonObserver(), observe: async (_request, signal) => {
    signal.addEventListener('abort', () => { aborted = true; }); return new Promise(() => {});
  } };
  const adapter = configuredWorkflowAction(x.store, x.f.dependencies.host, x.provider, new Map([[observerKey(observer.id, observer.version), observer]]));
  assert.equal((await adapter.reconcile(x.op, null)).result.status, 'outcome_unknown'); assert.equal(aborted, true);
  assert.equal(x.effects(), 1); assert.equal(x.dispatches(), 1); assert.equal(active(x), 1);
});

test('observation outages retry reads beyond ordinary retry limits and recover without another effect', async t => {
  const x = await fixture(t); await x.deliver(); await x.configure({}, 'unavailable');
  for (let i = 0; i < 7; i++) { x.advance(); const worker = x.worker(); await worker.tick(); await worker.drain(); }
  assert.equal(x.store.delivery(`operation:${x.op.operationId}`).state, 'reconcile');
  noVerified(x); assert.equal(active(x), 1);
  x.advance(); await x.configure({ observedAt: x.now() }); const worker = x.worker(); await worker.tick(); await worker.drain();
  assert.equal(state(x), 'verified'); assert.equal(x.effects(), 1); assert.equal(x.dispatches(), 1);
});

for (const mode of ['after-evidence', 'during-finalization', 'after-finalization']) test(`SIGKILL ${mode} preserves atomic deployment completion`, async t => {
  const x = await fixture(t); await x.deliver(); await x.stopListener();
  const data = join(x.root, `deployment-${mode}.json`);
  writeFileSync(data, JSON.stringify({ now: x.now(), operationId: x.op.operationId, run: x.runs[0], host: x.f.dependencies.host }));
  const process = child(t, 'deployment-process.mjs', [x.state, mode, data]);
  assert.equal((await message(process)).stage, mode);
  if (mode === 'after-finalization') { assert.equal(state(x), 'verified'); assert.equal(active(x), 0); }
  else { noVerified(x); assert.equal(active(x), 1); assert.notEqual(x.store.get('operation', x.op.operationId).state, 'succeeded'); }
  process.kill('SIGKILL'); await process.done; await x.restart();
  if (mode !== 'after-finalization') { const result = await x.adapter().reconcile(x.op, null); await x.accept(result); }
  assert.equal(state(x), 'verified'); assert.equal(active(x), 0);
  assert.equal(x.store.get('operation', x.op.operationId).state, 'succeeded'); assert.equal(x.effects(), 1); assert.equal(x.dispatches(), 1);
});

test('evidence finalization rejects stale samples, changed recovery epochs and late receipt conflicts', async t => {
  for (const mutation of ['stale', 'epoch', 'conflict', 'target-hold']) await t.test(mutation, async t => {
    const x = await fixture(t); const { receipt } = await x.deliver();
    const result = await x.adapter().reconcile(x.op, null);
    if (mutation === 'stale') x.advance(30001);
    if (mutation === 'epoch') x.store.enterRestore({ actorId: 'operator', reason: 'Restore safety test', evidenceRefs: ['test:restore'] });
    if (mutation === 'conflict') assert.equal((await x.post('receipt', { ...receipt, outputs: { changed: true } })).status, 409);
    if (mutation === 'target-hold') x.store.db.prepare('INSERT INTO resource_holds VALUES (?,?)').run(workflowResource(x.enrollment), 'operator_reconciliation');
    await assert.rejects(x.accept(result)); noVerified(x); assert.equal(active(x), 1); assert.equal(x.effects(), 1);
  });
});

test('AC11 deployment slice rejects forged receipt identities and independently observed workflow mismatches', async t => {
  const x = await fixture(t), claimReply = await x.post('claim'), claim = claimReply.body.claim;
  assert.equal(claimReply.status, 200);
  assert.equal((await x.post('authorize-effect', { schemaVersion: '1.0', requestDigest: x.op.requestDigest, claimId: claim.claimId })).status, 200);
  const receipt = { schemaVersion: '1.0', operationId: x.op.operationId, requestDigest: x.op.requestDigest, claimId: claim.claimId,
    fencingNumber: claim.fencingNumber, executor: claim.executor, sourceSha: x.op.source.sha, targetId: x.op.targetId,
    conclusion: 'succeeded', observedAt: x.now(), resources: [], outputs: { health: 'healthy', deploymentVerified: true } };
  for (const patch of [{ operationId: 'foreign' }, { requestDigest: 'd'.repeat(64) }, { claimId: 'foreign' }, { fencingNumber: claim.fencingNumber + 1 },
    { sourceSha: 'd'.repeat(40) }, { targetId: 'foreign' },
    ...[{ repositoryId: '999' }, { workflowPath: '.github/workflows/foreign.yml' }, { workflowSha: 'd'.repeat(40) }, { runId: '999' }, { runAttempt: 2 }]
      .map(patch => ({ executor: { ...claim.executor, ...patch } }))]) {
    assert.equal((await x.post('receipt', { ...receipt, ...patch })).status, 403);
    noVerified(x); assert.equal(x.store.workflowReceipt(x.op.operationId), null);
  }
  x.runs[0].status = 'completed'; x.runs[0].conclusion = 'success';
  assert.equal((await x.adapter().reconcile(x.op, null)).result.status, 'outcome_unknown', 'green workflow without a receipt');
  assert.equal((await x.post('receipt', receipt)).status, 200);
  const original = structuredClone(x.runs[0]);
  for (const patch of [{ repositoryId: '999' }, { workflowPath: '.github/workflows/foreign.yml' }, { workflowSha: 'd'.repeat(40) }, { runAttempt: 2 }]) {
    Object.assign(x.runs[0], original, patch);
    assert.equal((await x.adapter().reconcile(x.op, null)).result.status, 'outcome_unknown'); noVerified(x); assert.equal(active(x), 1);
  }
  Object.assign(x.runs[0], original, { conclusion: 'failure' });
  assert.equal((await x.adapter().reconcile(x.op, null)).result.status, 'outcome_unknown');
  assert.equal(x.store.workflowConflicted(x.op.operationId), true); noVerified(x); assert.equal(x.effects(), 0);
});

test('a bound failed workflow records failure without trusting a healthy target assertion', async t => {
  const x = await fixture(t); const reply = await x.post('claim'), claim = reply.body.claim;
  assert.equal((await x.post('authorize-effect', { schemaVersion: '1.0', requestDigest: x.op.requestDigest, claimId: claim.claimId })).status, 200);
  const receipt = { schemaVersion: '1.0', operationId: x.op.operationId, requestDigest: x.op.requestDigest, claimId: claim.claimId,
    fencingNumber: claim.fencingNumber, executor: claim.executor, sourceSha: x.op.source.sha, targetId: x.op.targetId,
    conclusion: 'failed', observedAt: x.now(), resources: [], outputs: { health: 'healthy' },
    error: { code: 'deployment_failed', message: 'Known recipe failure', retryClass: 'none' } };
  assert.equal((await x.post('receipt', receipt)).status, 200);
  x.runs[0].status = 'completed'; x.runs[0].conclusion = 'failure';
  const result = await x.adapter().reconcile(x.op, null);
  assert.equal(result.result.status, 'failed'); assert.equal(result.result.outputs.blocker, 'workflow_failed');
  await x.accept(result); assert.equal(state(x), 'failed'); assert.equal(active(x), 1); assert.equal(x.effects(), 0);
});

test('tested local manual rollback remains a separate effect and cannot rewrite the failed deployment', async t => {
  const x = await fixture(t, { profile(p) {
    p.recovery.methods = ['manual', 'rollback']; p.recovery.rollback.supported = true; p.recovery.migration.strategy = 'compatible';
    p.recovery.steps = ['With separate operator authorization, restore the previous application revision and independently check health.'];
    p.recovery.rollback.qualification = { recipeDigest: p.recipe.digest, targetId: 'target-a', environment: 'production', evidenceRefs: ['test:local-release-rollback'] };
  } });
  await x.deliver(); await x.configure({ health: 'unhealthy' });
  await x.accept(await x.adapter().reconcile(x.op, null)); assert.equal(x.effects(), 1);
  assert.equal(x.store.workflowExecutions(x.op.runId)[0].recovery.rollbackQualified, true);
  await x.configure(); await x.explicitRecovery('d'.repeat(40));
  const observer = localJsonObserver(), recovered = await observer.observe({ schemaVersion: '1.0', observationId: 'operator-recovery-observation',
    targetId: x.op.targetId, environment: x.enrollment.environment, configuration: x.deployment.observer.configuration }, AbortSignal.timeout(1000));
  assert.equal(recovered.sourceSha, 'd'.repeat(40)); assert.equal(recovered.health, 'healthy');
  await x.restart(); assert.equal(state(x), 'failed'); noVerified(x); assert.equal(active(x), 1);
  assert.equal(x.effects(), 2); assert.equal(x.dispatches(), 1);
});

test('trusted runtime passes an explicitly registered observer through workflow reconciliation', async t => {
  const x = await fixture(t); await x.deliver(); await x.stopListener();
  // The embedding API opens another connection to the same owned local store.
  const runtime = startExecution(x.state, { dependencies: x.dependencies, serialized: true,
    actions: { executorId: 'runtime-observer', nextAttempt: () => 'unused', adapters: new Map() },
    observations: { sessions: new Map(), projections: new Map() },
    workflowBroker: { host: x.f.dependencies.host, provider: x.provider, port: 0, observers: x.observers } });
  try { await runtime.ready; x.advance(); await x.configure({ observedAt: x.now() }); await runtime.tick();
    assert.equal(runtime.store.get('deployment', deploymentId(x.op.operationId)).state, 'verified'); assert.equal(x.effects(), 1);
  } finally { await runtime.close(); }
});

test('migration 15 preserves original dispatch and receipt without inventing deployment evidence', async t => {
  const x = await workflowFixture(t); const before = x.store.workflowDispatch(x.op.operationId);
  await x.stopListener();
  const db = new DatabaseSync(join(x.state, 'state.sqlite'));
  db.exec('DROP TABLE deployment_evidence; DELETE FROM schema_migrations WHERE version=15; PRAGMA user_version=14'); db.close();
  await x.restart();
  assert.deepEqual(x.store.workflowDispatch(x.op.operationId), before);
  assert.equal(x.store.deploymentEvidence(x.op.operationId), null); assert.equal(x.dispatches(), 1);
  assert.equal(x.store.snapshot().records.filter(record => record.kind === 'deployment').length, 0);
});

test('rollback qualification is bound to tested recipe/target/environment and compatible migrations', () => {
  const p = profile('http://127.0.0.1:1234/state');
  p.recovery.methods = ['manual', 'rollback']; p.recovery.rollback.supported = true;
  assert.equal(recoveryDetails(p, 'target-a', 'production').rollbackQualified, false);
  p.recovery.rollback.qualification = { recipeDigest: p.recipe.digest, targetId: 'target-a', environment: 'production', evidenceRefs: ['test:tested-recovery'] };
  assert.equal(recoveryDetails(p, 'target-a', 'production').rollbackQualified, false, 'irreversible migration');
  p.recovery.migration.strategy = 'compatible';
  assert.equal(recoveryDetails(p, 'target-a', 'production').rollbackQualified, true);
  for (const [key, value] of [['recipeDigest', 'f'.repeat(64)], ['targetId', 'other'], ['environment', 'other']]) {
    const changed = structuredClone(p); changed.recovery.rollback.qualification[key] = value;
    assert.equal(recoveryDetails(changed, 'target-a', 'production').rollbackQualified, false);
  }
  const changed = structuredClone(p); changed.recovery.rollback.qualification.evidenceRefs = [];
  assert.throws(() => validated('deployment-profile', changed), /invalid_payload/);
});
