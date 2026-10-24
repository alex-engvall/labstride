import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, fork } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { workflowFixture } from './workflow-fixture.mjs';
import { configuredWorkflowAction } from '../../packages/workflow-broker/action.ts';
import { localJsonObserver } from '../../packages/workflow-broker/local-observer.ts';
import { observerKey } from '../../packages/core/deployments.ts';
import { workflowRunName } from '../../packages/core/workflow-broker.ts';
import { claimOperation, executeClaim } from '../../tools/workflow-runner/client.mjs';

export async function orderingFixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'labstride-ordering-')), repo = join(root, 'source'), targetPath = join(root, 'target.sqlite');
  mkdirSync(repo);
  const git = args => { const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  git(['init', '-b', 'main']);
  function commit(text) { writeFileSync(join(repo, 'release'), text); git(['add','release']); git(['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m',text]); return git(['rev-parse','HEAD']); }
  const a = commit('A'), b = commit('B'), c = commit('C');
  git(['checkout','-b','divergent',a]); const divergent = commit('divergent'); git(['checkout','main']);
  const target = fork(new URL('./deployment-target.mjs', import.meta.url), [targetPath], { stdio: ['ignore','ignore','pipe','ipc'] });
  const exited = once(target, 'exit');
  const message = async () => (await once(target, 'message', { signal: AbortSignal.timeout(10000) }))[0];
  const { url } = await message();
  t.after(async () => { if (target.exitCode === null && target.signalCode === null) { target.kill('SIGKILL'); await exited; } rmSync(root, { recursive: true, force: true }); });
  const observer = localJsonObserver(), observers = new Map([[observerKey(observer.id, observer.version), observer]]);
  const deployment = { schemaVersion: '1.0', recipe: { id: 'example.release', version: '1.0.0', digest: 'e'.repeat(64) },
    observer: { id: observer.id, version: observer.version, configuration: { endpoint: url + '/state' } },
    observationTimeoutMs: 1000, maxObservationAgeMs: 30000,
    recovery: { methods: ['manual'], steps: ['Reconcile the original target before authorizing recovery.'],
      migration: { strategy: 'irreversible', limits: ['Application rollback does not undo migrations.'] }, rollback: { supported: false, qualification: null } } };
  const x = await workflowFixture(t, { prepared: true, deployment, observers, followup: true, async configure(f, enrollment) {
    f.source.sha = a;
    f.config.workflows.prepare[0].inputs.enrollment = { binding: 'field', field: f.names.note };
    const pin = f.dependencies.lock.extensions.find(p => p.id === 'labstride.github-workflow');
    pin.configuration.enrollments.other = { ...structuredClone(enrollment), environment: 'staging' };
    if (options.configure) await options.configure(f, enrollment);
  } });
  const runs = new Map(), dispatches = [];
  x.provider.dispatch = async (enrollment, op) => {
    const id = String(301 + runs.size);
    const run = { ...x.runs[0], runId: id, name: workflowRunName(op), status: 'in_progress', conclusion: null, createdAt: x.now() };
    runs.set(op.operationId, run); dispatches.push(op.operationId); return id;
  };
  x.provider.find = async (_enrollment, op) => { const run = runs.get(op.operationId); return run ? [structuredClone(run)] : []; };
  x.provider.run = async (_enrollment, id, attempt) => { const run = [...runs.values()].find(r => r.runId === id && r.runAttempt === attempt); if (!run) throw Error('missing_run'); return structuredClone(run); };
  x.provider.compare = async (_enrollment, source, baseSha, headSha) => {
    assert.equal(source.repositoryId, x.op.source.repositoryId);
    git(['cat-file','-e',baseSha + '^{commit}']); git(['cat-file','-e',headSha + '^{commit}']);
    const ancestor = (base, head) => spawnSync('git',['-C',repo,'merge-base','--is-ancestor',base,head]).status === 0;
    return { schemaVersion: '1.0', repositoryId: source.repositoryId, baseSha, headSha,
      relation: baseSha === headSha ? 'identical' : ancestor(baseSha,headSha) ? 'ahead' : ancestor(headSha,baseSha) ? 'behind' : 'diverged' };
  };
  const adapter = () => configuredWorkflowAction(x.store, x.f.dependencies.host, x.provider, observers);
  async function start(op) {
    await adapter().validate(op);
    const revision = x.store.get('operation',op.operationId).revision;
    const claim = x.store.claim(op.operationId,'ordering-test','attempt'); x.store.beginEffect(claim);
    const result = await adapter().start(op,claim); x.store.acceptResult(result,claim,revision);
    return result;
  }
  async function reconcile(op) {
    x.store.markUnknown(op.operationId); const record = x.store.get('operation',op.operationId), epoch = x.store.recoveryEpoch();
    const result = await adapter().reconcile(op,null); x.store.acceptResult(result,null,record.revision,[],epoch); return result;
  }
  const runner = op => {
    const run = runs.get(op.operationId), enrollment = x.store.workflowEnrollment(op.operationId);
    return { ...x.runnerOptions, operationId: op.operationId, requestDigest: op.requestDigest,
      env: { ...x.runnerOptions.env, GITHUB_RUN_ID: run.runId }, fetcher: async (requestUrl, init) => {
        if (new URL(requestUrl).hostname === 'oidc.test') return Response.json({ value: await x.sign({ run_id: run.runId, environment: enrollment.environment }) });
        return fetch(String(requestUrl).replace('https://broker.test', x.url), init);
      } };
  };
  async function deliver(op) {
    const opts = runner(op), bound = await claimOperation(opts);
    await executeClaim(opts,bound,{ observeSource: () => git(['rev-parse',op.source.sha]), async effect() {
      const enrollment = x.store.workflowEnrollment(op.operationId);
      const response = await fetch(url + '/deploy',{ method:'POST',body:JSON.stringify({ operationId:op.operationId,targetId:op.targetId,
        environment:enrollment.environment,resourceId:'release',sourceRepositoryId:op.source.repositoryId,sourceSha:op.source.sha,health:'healthy',observedAt:x.now() }) });
      assert.equal(response.status,200); return { conclusion:'succeeded',resources:[],outputs:{} };
    } });
    const run = runs.get(op.operationId); run.status='completed'; run.conclusion='success';
  }
  return { ...x, get store() { return x.store; }, get url() { return x.url; }, root, targetPath, repo, git, a, b, c, divergent, deployment, observers, runs, dispatches, adapter, start, reconcile, deliver, runner,
    async configureTarget(patch) { const reply=message(); target.send({ patch }); await reply; },
    effects() { const db=new DatabaseSync(targetPath,{readOnly:true});try{return db.prepare('SELECT operation_id FROM effects').all().map(r=>r.operation_id);}finally{db.close();} },
    target() { const db=new DatabaseSync(targetPath,{readOnly:true});try{return JSON.parse(db.prepare('SELECT payload FROM release WHERE id=1').get().payload);}finally{db.close();} },
  };
}
