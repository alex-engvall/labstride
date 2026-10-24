import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import { publicFixture } from './public-installation-fixture.mjs';
import { workspaceFixture } from './workspace-fixture.mjs';
import { WorkspaceRegistry } from '../../packages/target-helper/workspaces.ts';
import { openOperationalRuntime } from '../../packages/operations/runtime.ts';
import { saveProbe } from '../../packages/operations/runner-probe.ts';
import { workflowRunName } from '../../packages/core/workflow-broker.ts';
import { cli } from '../../apps/cli/main.ts';
import { acquireServiceLock } from '../../packages/operations/loop.ts';

const keys = generateKeyPair('RS256');
const connectorModule = `export function createExtension(configuration) { return {async validate(){},async invoke(request){const response=await fetch(configuration.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)});return response.json();}};}`;
export async function publicRecoveryFixture(t, { fence = true } = {}) {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-24T12:00:00.000Z') });
  const workspace = workspaceFixture(t); workspace.policy.targetId = 'development';
  const registry = new WorkspaceRegistry(workspace.policy, workspace.dependencies); t.after(() => registry.close());
  const methods = [];
  const server = createServer(async (request, response) => {
    const chunks = []; for await (const part of request) chunks.push(part);
    const input = JSON.parse(Buffer.concat(chunks)); methods.push(input.method);
    response.end(JSON.stringify(await registry.handle(input)));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise(resolve => server.close(resolve)));
  const f = publicFixture(t, { sourceSha: workspace.operation.source.sha, connectorModule,
    connectorConfiguration: { revision: 1, endpoint: `http://127.0.0.1:${server.address().port}` } });
  const spec = f.spec;
  const enrollment = { schemaVersion: '1.0', repository: { name: 'example/source', nodeId: 'repository-test', id: '101', ownerId: '7' },
    workflowId: '201', workflowPath: '.github/workflows/delivery.yml', ref: 'refs/heads/trusted', workflowSha: 'b'.repeat(40),
    targetId: 'development', environment: 'test', credentialRef: 'secret:repository', inputs: {} };
  const artifactPath = join(f.root, 'workflow.json');
  execFileSync(process.execPath, ['scripts/package_extension.mjs', 'packages/action-github-workflow', artifactPath]);
  const artifact = JSON.parse(readFileSync(artifactPath));
  const pin = { id: artifact.manifest.id, version: artifact.manifest.version, kind: 'action', artifactPath,
    integrity: createHash('sha256').update(readFileSync(artifactPath)).digest('hex'), permissions: artifact.manifest.permissions,
    capabilities: artifact.manifest.capabilities, configuration: { enrollments: { selected: enrollment } } };
  spec.lock.extensions.push(pin); spec.configuration.extensions.push({ id: pin.id, version: pin.version, integrity: pin.integrity });
  spec.policy.grants.push({ ...spec.policy.grants[0], actionId: pin.id, actionVersion: pin.version });
  spec.configuration.workflows.prepare.push({ id: 'workflow', action: pin.id, inputs: { target: 'development', enrollment: 'selected', source: 'context.source' } },
    { id: 'later-checkout', action: 'labstride.workspace-create', inputs: { target: 'development', rootId: 'source', source: 'context.source' } });
  spec.configuration.broker = { url: 'https://broker.example.test', oidcAudience: 'labstride:test' };
  const portServer = createServer(); portServer.listen(0, '127.0.0.1'); await once(portServer, 'listening');
  spec.brokerListener = { port: portServer.address().port }; await new Promise(resolve => portServer.close(resolve));
  const policy = JSON.parse(readFileSync(new URL('../../tools/oidc-probe/policy.example.json', import.meta.url)));
  Object.assign(policy, { audience: 'labstride:test', repository: 'example/source', repositoryId: '101', ownerId: '7' });
  spec.brokerProbe = { policy, maxAgeSeconds: 60 }; spec.configuration.enabled = true;
  const { privateKey, publicKey } = await keys;
  const jwk = { ...await exportJWK(publicKey), kid: 'recovery-test', alg: 'RS256' };
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, init) => String(url) === 'https://token.actions.githubusercontent.com/.well-known/jwks'
    ? Response.json({ keys: [jwk] }) : realFetch(url, init));
  let op, run, dispatches = 0, reads = 0;
  const transport = async (url, init = {}) => {
    const path = new URL(url).pathname;
    if (path.includes('/actions/')) {
      if (path.endsWith('/dispatches')) {
        dispatches++;
        const request = JSON.parse(init.body), operationId = request.inputs.operation_id;
        run = { id: 301, run_attempt: 1, repository: { id: 101, node_id: 'repository-test', full_name: 'example/source', owner: { id: 7 } },
          head_repository: { id: 101, full_name: 'example/source' }, workflow_id: 201, path: enrollment.workflowPath,
          head_branch: 'trusted', head_sha: enrollment.workflowSha, event: 'workflow_dispatch', status: 'in_progress', conclusion: null,
          display_title: workflowRunName({ operationId, requestDigest: request.inputs.request_digest }), created_at: new Date().toISOString() };
        return Response.json({ workflow_run_id: 301 });
      }
      if (path.includes('/runs')) { reads++; return Response.json(path.endsWith('/runs') ? { total_count: run ? 1 : 0, workflow_runs: run ? [run] : [] } : run); }
      return Response.json({ id: 201, path: enrollment.workflowPath, state: 'active' });
    }
    if (path.includes('/commits/')) return Response.json({ sha: path.endsWith('refs%2Fheads%2Ftrusted') ? enrollment.workflowSha : path.split('/').at(-1) });
    if (path === '/repos/example/source') return Response.json({ id: 101, node_id: 'repository-test', full_name: 'example/source', owner: { id: 7 } });
    return f.transport(url, init);
  };
  saveProbe(spec, 'controlled-fixture-qualification'); f.write();
  let runtime = await openOperationalRuntime(spec, { transport }), release;
  const close = async () => {
    try { if (runtime) { await runtime.close(); runtime = null; } }
    finally { await release?.(); release = undefined; }
  };
  t.after(close);
  await runtime.tick(); f.change(); runtime.store.receiveGitHubWebhook(spec.configuration.installationId, 'approved', 'a'.repeat(64));
  for (let i = 0; i < 4; i++) await runtime.tick();
  const installedRun = runtime.store.runs()[0];
  op = runtime.store.operations(installedRun.id).find(operation => operation.request.actionId === pin.id)?.request;
  assert(op); assert.equal(dispatches, 1);
  const origin = `http://127.0.0.1:${spec.brokerListener.port}`;
  const sign = (patch = {}) => {
    const iat = Math.floor(Date.now() / 1000);
    return new SignJWT({ iss: 'https://token.actions.githubusercontent.com', aud: 'labstride:test', sub: 'fixture', jti: 'never-persist-recovery-token',
      iat, nbf: iat, exp: iat + 300, repository: enrollment.repository.name, repository_id: '101', repository_owner_id: '7',
      workflow_ref: `${enrollment.repository.name}/${enrollment.workflowPath}@${enrollment.ref}`, workflow_sha: enrollment.workflowSha,
      ref: enrollment.ref, sha: enrollment.workflowSha, run_id: '301', run_attempt: '1', event_name: 'workflow_dispatch',
      runner_environment: 'github-hosted', environment: 'test', ...patch }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(privateKey);
  };
  const post = async (phase, body, token) => {
    const response = await realFetch(`${origin}/v1/operations/${op.operationId}/${phase}`, { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? await sign()}` }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const message = { schemaVersion: '1.0', requestDigest: op.requestDigest };
  const claimed = await post('claim', message); assert.equal(claimed.status, 200, JSON.stringify(claimed));
  const claim = claimed.body.claim;
  assert.equal((await post('authorize-effect', { ...message, claimId: claim.claimId })).status, 200);
  const receipt = { schemaVersion: '1.0', operationId: op.operationId, requestDigest: op.requestDigest, claimId: claim.claimId,
    fencingNumber: claim.fencingNumber, executor: claim.executor, sourceSha: op.source.sha, targetId: op.targetId,
    conclusion: 'succeeded', observedAt: new Date().toISOString(), resources: [], outputs: {} };
  const original = { digest: runtime.store.get('installation', spec.configuration.installationId).configRevision,
    policy: runtime.store.policyStatus(spec.configuration.installationId), dispatch: runtime.store.workflowDispatch(op.operationId), claim };
  await close(); if (fence) await cli(['recovery','begin','--config',f.path], () => {});
  return { ...f, transport, op, installedRun, receipt, message, original, post, sign, methods, jwk, close, workspace,
    dispatches: () => dispatches, reads: () => reads,
    complete() { run.status = 'completed'; run.conclusion = 'success'; },
    async open(mode = 'reconcile-only') {
      release = await acquireServiceLock(spec.stateDirectory);
      try { runtime = await openOperationalRuntime(spec, { transport, mode }); return runtime; }
      catch (error) { await release(); release = undefined; throw error; }
    } };
}
