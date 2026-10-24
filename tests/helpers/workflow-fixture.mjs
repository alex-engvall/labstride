import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from 'jose';
import { configurationFixture, observation, planFor, context, localAuthority, policyDependencies, publishFixturePolicy } from './configuration-fixture.mjs';
import { startCoordinator } from '../../apps/coordinator/main.ts';
import { createWorker, actionKey } from '../../packages/core/worker.ts';
import { requestDigest } from '../../packages/storage-sqlite/execution.ts';
import { configuredWorkflowAction } from '../../packages/workflow-broker/action.ts';
import { workflowRunName, workflowResource } from '../../packages/core/workflow-broker.ts';
import { createWorkflowBroker } from '../../packages/workflow-broker/server.ts';
import { createWorkflowVerifier, workflowIssuer } from '../../packages/workflow-broker/identity.ts';

const keys = generateKeyPair('RS256');
export async function workflowFixture(t, { variant = 'a', dispatch = 'normal', prepared = false, checkoutSource = false, deadlineMs } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'labstride-workflow-')), state = join(root, 'state');
  let store, server;
  t.after(async () => { if (server?.listening) await new Promise(resolve => server.close(resolve)); store?.close(); rmSync(root, { recursive: true, force: true }); });
  const f = configurationFixture(root), enrollment = { schemaVersion: '1.0', repository: { name: 'example/workflows', nodeId: 'R_workflows', id: '101', ownerId: '7' },
    workflowId: variant === 'a' ? '201' : '202', workflowPath: `.github/workflows/delivery-${variant}.yml`, ref: 'refs/heads/trusted', workflowSha: (variant === 'a' ? 'b' : 'c').repeat(40),
    targetId: variant === 'a' ? 'target-a' : 'target-b', environment: variant === 'a' ? 'production' : 'replacement', credentialRef: 'secret:repository', inputs: { recipe: 'record-release' } };
  if (variant === 'b') f.config.targets['target-b'] = structuredClone(f.config.targets['target-a']);
  if (checkoutSource) {
    const repo = join(root, 'application');
    const { mkdirSync, writeFileSync } = await import('node:fs'); mkdirSync(repo);
    const git = args => { const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
    git(['init']); writeFileSync(join(repo, 'release.txt'), 'application revision'); git(['add', 'release.txt']);
    git(['-c', 'user.name=Workflow Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Application revision']);
    f.source.sha = git(['rev-parse','HEAD']);
  }
  const artifactPath = join(root, 'workflow.artifact.json');
  const packaged = spawnSync(process.execPath, ['scripts/package_extension.mjs', 'packages/action-github-workflow', artifactPath], { encoding: 'utf8' });
  assert.equal(packaged.status, 0, packaged.stderr);
  const pin = { id: 'labstride.github-workflow', version: '1.0.0', kind: 'action', artifactPath, integrity: createHash('sha256').update(readFileSync(artifactPath)).digest('hex'),
    permissions: ['network.github'], capabilities: ['workflow.dispatch.v1'], configuration: { enrollments: { selected: enrollment } } };
  f.dependencies.lock.extensions.push(pin);
  f.config.workflows.prepare = [{ id: 'deliver', action: pin.id, inputs: { target: enrollment.targetId, enrollment: 'selected', source: 'context.source' } }];
  const compilation = await f.compile(); assert.equal(compilation.ok, true, JSON.stringify(compilation.diagnostics));
  const compiled = compilation.configuration; let now = '2026-10-23T12:00:00.000Z';
  const dependencies = { ...policyDependencies, clock: { now: () => now } };
  store = startCoordinator(state, dependencies).store;
  store.activateConfiguration(compiled, null, context, localAuthority); publishFixturePolicy(store, f, compiled);
  const observed = observation(f, compiled);
  const originalBuilder = planFor(f, compiled);
  const admitted = store.requestConfiguredStart(compiled, observed, { source: f.source }, (steps, observation) => {
    const plan = originalBuilder(steps, observation);
    plan.workspace.targetId = enrollment.targetId; plan.operation.request.targetId = enrollment.targetId; plan.operation.request.source = structuredClone(f.source);
    if (deadlineMs !== undefined) plan.operation.request.deadline = new Date(Date.parse(now) + deadlineMs).toISOString();
    plan.operation.request.requestDigest = requestDigest(plan.operation.request);
    plan.resourceKey = workflowResource(enrollment); return plan;
  }, context);
  assert.equal(admitted.evaluation.outcome, 'matched');
  const op = store.operations(admitted.runId)[0].request;
  const { privateKey, publicKey } = await keys, jwk = { ...await exportJWK(publicKey), alg: 'RS256', kid: 'workflow-test' };
  const getKey = createLocalJWKSet({ keys: [jwk] });
  const runs = [{ runId: '301', runAttempt: 1, repositoryId: '101', repositoryNodeId: 'R_workflows', repository: 'example/workflows', ownerId: '7',
    workflowId: enrollment.workflowId, workflowPath: enrollment.workflowPath, refName: 'trusted', workflowSha: enrollment.workflowSha,
    event: 'workflow_dispatch', status: 'in_progress', conclusion: null, name: workflowRunName(op), createdAt: now }];
  let dispatches = 0, readError = false, discover = true;
  const provider = {
    async preflight() {},
    async dispatch() { dispatches++; if (dispatch === 'lost') throw Error('response_lost_after_run_started'); return dispatch === 'empty' ? null : '301'; },
    async run(_enrollment, id, attempt) { if (readError) throw Error('provider_down'); const run = runs.find(run => run.runId === id && run.runAttempt === attempt); if (!run) throw Error('missing_run'); return structuredClone(run); },
    async find() { if (readError) throw Error('provider_down'); return discover ? structuredClone(runs) : []; },
  };
  const options = () => ({ executorId: 'coordinator', nextAttempt: () => 'dispatch-attempt', adapters: new Map([[actionKey(pin.id, pin.version), configuredWorkflowAction(store, f.dependencies.host, provider)]]) });
  const worker = () => createWorker(store, options());
  const sign = async (patch = {}, key = privateKey) => {
    const iat = Math.floor(Date.parse(now) / 1000);
    return new SignJWT({ iss: workflowIssuer, aud: f.config.broker.oidcAudience, sub: 'synthetic-workflow', jti: 'synthetic-token', iat, nbf: iat, exp: iat + 300,
      repository: enrollment.repository.name, repository_id: enrollment.repository.id, repository_owner_id: enrollment.repository.ownerId,
      workflow_ref: `${enrollment.repository.name}/${enrollment.workflowPath}@${enrollment.ref}`, workflow_sha: enrollment.workflowSha,
      ref: enrollment.ref, sha: enrollment.workflowSha, run_id: '301', run_attempt: '1', event_name: 'workflow_dispatch', runner_environment: 'github-hosted', environment: enrollment.environment,
      ...patch }).setProtectedHeader({ alg: 'RS256', kid: 'workflow-test' }).sign(key);
  };
  const verifier = () => (...args) => createWorkflowVerifier(provider, { getKey, currentDate: new Date(now) })(...args);
  let url;
  const listen = async () => {
    server = createWorkflowBroker(store, provider, verifier());
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); url = `http://127.0.0.1:${server.address().port}`;
  };
  const post = async (phase, body = { schemaVersion: '1.0', requestDigest: op.requestDigest }, token, headers = {}) => {
    const response = await fetch(`${url}/v1/operations/${op.operationId}/${phase}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? await sign()}`, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  if (!prepared) { const w = worker(); await w.tick(); await w.drain(); }
  await listen();
  const env = { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.test/token', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'OIDC_PRIVATE_SENTINEL',
    GITHUB_RUN_ID: '301', GITHUB_RUN_ATTEMPT: '1', GITHUB_REPOSITORY_ID: '101', GITHUB_REPOSITORY: enrollment.repository.name,
    GITHUB_WORKFLOW_SHA: enrollment.workflowSha, GITHUB_REF: enrollment.ref, GITHUB_WORKFLOW_REF: `${enrollment.repository.name}/${enrollment.workflowPath}@${enrollment.ref}` };
  const runnerOptions = { endpoint: 'https://broker.test', audience: f.config.broker.oidcAudience, operationId: op.operationId, requestDigest: op.requestDigest, env,
    now: () => Date.parse(now), fetcher: async (url, init) => {
      if (new URL(url).hostname === 'oidc.test') return Response.json({ value: await sign() });
      return fetch(`${url}`.replace('https://broker.test', `http://127.0.0.1:${server.address().port}`), init);
    } };
  return { root, state, op, f, compiled, enrollment, dependencies, runs, provider, worker, sign, verifier, post, runnerOptions,
    get store() { return store; }, get url() { return url; }, dispatches: () => dispatches, getKey, jwk,
    readError(value) { readError = value; }, discover(value) { discover = value; }, advance(ms = 60001) { now = new Date(Date.parse(now) + ms).toISOString(); },
    async restart() { await new Promise(resolve => server.close(resolve)); store.close(); store = startCoordinator(state, dependencies).store; await listen(); },
    async stopListener() { await new Promise(resolve => server.close(resolve)); },
    now: () => now,
  };
}
