import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubWorkflowProvider, normalizeWorkflowRun } from '../packages/provider-github/workflows.ts';
import { workflowRunName } from '../packages/core/workflow-broker.ts';
import { startPlan } from './helpers/execution-fixture.mjs';
const op = startPlan().operation.request;
const enrollment = { schemaVersion: '1.0', repository: { name: 'example/workflows', id: '101', nodeId: 'R_workflows', ownerId: '7' },
  workflowId: '201', workflowPath: '.github/workflows/delivery.yml', ref: 'refs/heads/trusted', workflowSha: 'b'.repeat(40),
  targetId: op.targetId, environment: 'production', credentialRef: 'secret:actions', inputs: {} };
const rawRun = () => ({ id: 301, run_attempt: 1, repository: { id: 101, node_id: 'R_workflows', full_name: 'example/workflows', owner: { id: 7 } },
  head_repository: { id: 101, full_name: 'example/workflows' }, workflow_id: 201, path: enrollment.workflowPath, head_branch: 'trusted', head_sha: enrollment.workflowSha,
  event: 'workflow_dispatch', status: 'in_progress', conclusion: null, display_title: workflowRunName(op), created_at: '2026-10-23T12:00:00Z' });
for (const status of [200,204]) test(`dispatch accepts HTTP ${status}, sends only bounded IDs, and never exposes its credential`, async () => {
  let calls = 0;
  const provider = new GitHubWorkflowProvider(async reference => { assert.equal(reference, 'secret:actions'); return 'PRIVATE_ACTIONS_SENTINEL'; }, async (url, init) => {
    calls++; assert.equal(url, 'https://api.github.com/repos/example/workflows/actions/workflows/201/dispatches');
    assert.equal(init.redirect, 'error'); assert.equal(init.headers.authorization, 'Bearer PRIVATE_ACTIONS_SENTINEL');
    assert.deepEqual(JSON.parse(init.body), { ref: enrollment.ref, return_run_details: true,
      inputs: { operation_id: op.operationId, request_digest: op.requestDigest, schema_version: '1.0' } });
    return status === 204 ? new Response(null, { status }) : Response.json({ workflow_run_id: 301 });
  });
  assert.equal(await provider.dispatch(enrollment, op), status === 204 ? null : '301'); assert.equal(calls, 1);
});
test('dispatch transport loss is surfaced once with no internal retry', async () => {
  let calls = 0;
  const provider = new GitHubWorkflowProvider(async () => 'private', async () => { calls++; throw Error('response lost'); });
  await assert.rejects(provider.dispatch(enrollment, op), e => e.code === 'provider_unavailable'); assert.equal(calls, 1);
});
test('attempt-specific metadata retains numeric and node repository identities and rejects foreign heads', async () => {
  let path;
  const provider = new GitHubWorkflowProvider(async () => 'private', async url => { path = url; return Response.json(rawRun()); });
  const run = await provider.run(enrollment, '301', 1);
  assert.equal(path, 'https://api.github.com/repos/example/workflows/actions/runs/301/attempts/1');
  assert.equal(run.repositoryId, '101'); assert.equal(run.repositoryNodeId, 'R_workflows');
  assert.throws(() => normalizeWorkflowRun({ ...rawRun(), id: Number.MAX_SAFE_INTEGER + 1 }));
  assert.throws(() => normalizeWorkflowRun({ ...rawRun(), head_repository: { id: 999, full_name: 'foreign/repo' } }));
  await assert.rejects(provider.run(enrollment, '../secret', 1));
});
test('preflight resolves workflow ref and independent application SHA and denies moved or substituted identities', async () => {
  let patch = {}, called = [];
  const provider = new GitHubWorkflowProvider(async () => 'private', async url => {
    called.push(url);
    if (url.endsWith('/actions/workflows/201')) return Response.json({ id: 201, path: enrollment.workflowPath, state: 'active' });
    if (url.endsWith('/repos/example/workflows')) return Response.json({ id: 101, node_id: 'R_workflows', full_name: 'example/workflows', owner: { id: 7 }, ...patch });
    if (url.endsWith(`/repos/${op.source.repository}`)) return Response.json({ node_id: op.source.repositoryId, full_name: op.source.repository });
    if (url.includes('/commits/refs%2Fheads%2Ftrusted')) return Response.json({ sha: enrollment.workflowSha });
    if (url.endsWith(`/commits/${op.source.sha}`)) return Response.json({ sha: op.source.sha });
    throw Error('unexpected request');
  });
  await provider.preflight(enrollment, op); assert.equal(called.length, 5);
  patch = { id: 999 }; await assert.rejects(provider.preflight(enrollment, op), e => e.code === 'identity_rejected');
  patch = { node_id: 'R_foreign' }; await assert.rejects(provider.preflight(enrollment, op), e => e.code === 'identity_rejected');
  await assert.rejects(provider.preflight({ ...enrollment, workflowSha: 'c'.repeat(40) }, op), e => e.code === 'identity_rejected');
});
test('run discovery paginates and treats run names only as candidate locators', async () => {
  const requests = [];
  const provider = new GitHubWorkflowProvider(async () => 'private', async url => {
    requests.push(url);
    const rows = url.endsWith('page=1') ? Array.from({ length: 100 }, (_, index) => ({ ...rawRun(), id: 1000 + index, display_title: 'unrelated' })) : [rawRun()];
    return Response.json({ total_count: 101, workflow_runs: rows });
  });
  const found = await provider.find(enrollment, op, '2026-10-23T12:00:00Z');
  assert.equal(requests.length, 2); assert.equal(found.length, 1); assert.equal(found[0].runId, '301');
});
test('provider rejects incomplete, oversized and malformed responses instead of inventing successful evidence', async () => {
  for (const response of [new Response('broken'), new Response('x'.repeat(2097153)), Response.json({ total_count: 1001, workflow_runs: [] }), new Response('{}', { status: 403 })]) {
    const provider = new GitHubWorkflowProvider(async () => 'private', async () => response);
    await assert.rejects(provider.find(enrollment, op, '2026-10-23T12:00:00Z'));
  }
});
