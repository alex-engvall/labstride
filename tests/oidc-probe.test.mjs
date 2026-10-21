import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from 'jose';
import { ISSUER, ProbeError, createVerifier, createProbeServer, createRunReader, validatePolicy } from '../tools/oidc-probe/probe.mjs';

const policy = JSON.parse(readFileSync(new URL('../tools/oidc-probe/policy.example.json', import.meta.url)));
const now = Math.floor(Date.now() / 1000);
let privateKey, getKey, otherPrivateKey;
before(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  getKey = createLocalJWKSet({ keys: [{ ...jwk, alg: 'RS256', kid: 'fixture' }] });
  ({ privateKey: otherPrivateKey } = await generateKeyPair('RS256'));
});
const claims = () => ({
  iss: ISSUER, aud: policy.audience, sub: 'synthetic-subject-do-not-infer-format', jti: 'synthetic-jti',
  iat: now, nbf: now, exp: now + 300,
  repository: policy.repository, repository_id: policy.repositoryId, repository_owner_id: policy.ownerId,
  workflow_ref: `${policy.repository}/${policy.workflowPath}@${policy.ref}`, workflow_sha: policy.workflowSha,
  ref: policy.ref, sha: policy.workflowSha, run_id: policy.runId, run_attempt: policy.runAttempt,
  event_name: 'push', runner_environment: 'github-hosted',
});
const run = () => ({
  id: Number(policy.runId), run_attempt: Number(policy.runAttempt),
  repository: { id: Number(policy.repositoryId), full_name: policy.repository,
    owner: { id: Number(policy.ownerId), login: policy.repository.split('/')[0] } },
  head_repository: { id: Number(policy.repositoryId), full_name: policy.repository },
  path: policy.workflowPath, head_branch: policy.ref.slice(11), head_sha: policy.workflowSha,
  event: 'push', status: 'in_progress',
});
const sign = (changes = {}, key = privateKey) => new SignJWT({ ...claims(), ...changes })
  .setProtectedHeader({ alg: 'RS256', kid: 'fixture' }).sign(key);
const isError = (code, status) => error => error instanceof ProbeError && error.code === code && error.status === status;
const verifier = (readRun = async () => run()) => createVerifier(policy, { getKey, readRun, currentDate: new Date(now * 1000) });

test('probe policy and request are versioned; policy is copied and frozen', () => {
  const result = validatePolicy(policy);
  assert.ok(Object.isFrozen(result));
  for (const patch of [{ schemaVersion: '2.0' }, { issuer: 'https://attacker.invalid' },
    { repository: '../../secret' }, { ref: 'refs/pull/1/merge' }, { eventName: 'pull_request_target' },
    { runId: '1/attempts/2' }, { workflowPath: '.github/workflows/../../secret.yml' }]) {
    assert.throws(() => validatePolicy({ ...policy, ...patch }), /invalid_probe_policy/);
  }
});

test('real synthetic RSA signature and independent attempt produce redacted discovery evidence', async () => {
  let calls = 0;
  const token = await sign();
  const result = await verifier(async actual => { calls++; assert.deepEqual(actual, policy); return run(); })(token);
  assert.equal(calls, 1);
  assert.equal(result.result, 'verified_discovery_identity');
  assert.equal(result.runAttempt, '1');
  assert.deepEqual(result.token, { issuedAt: now, notBefore: now, expiresAt: now + 300 });
  assert.ok(result.claimNames.includes('jti'));
  assert.ok(!JSON.stringify(result).includes(token));
  assert.ok(!JSON.stringify(result).includes('synthetic-jti'));
  assert.ok(!JSON.stringify(result).includes('synthetic-subject'));
});

test('reissued same-run token is safe to observe twice; there are no operation effects', async () => {
  const verify = verifier();
  const first = await verify(await sign());
  const second = await verify(await sign({ jti: 'new-token-jti' }));
  assert.deepEqual(first, second);
});

test('negative profiles require baseline identity and reject the same genuine fixture token', async () => {
  let calls = 0;
  const verify = verifier(async () => { calls++; return run(); });
  const token = await sign();
  for (const name of ['wrong-repository', 'wrong-workflow', 'wrong-run', 'wrong-attempt']) {
    await assert.rejects(verify(token, name), isError('identity_rejected', 403));
  }
  await assert.rejects(verify(token, 'unknown'), isError('invalid_payload', 400));
  assert.equal(calls, 4);
  // A token matching the deliberately wrong run cannot gain admission through it.
  calls = 0;
  await assert.rejects(verify(await sign({ run_id: '1' }), 'wrong-run'), isError('identity_rejected', 403));
  assert.equal(calls, 0);
});

for (const [field, bad] of Object.entries({ iss: 'https://attacker.invalid', aud: 'wrong-audience',
  repository: 'other/repository', repository_id: '99', repository_owner_id: '99',
  workflow_ref: 'other/workflow@refs/heads/oidc-discovery', workflow_sha: '2'.repeat(40),
  ref: 'refs/heads/main', sha: '2'.repeat(40), run_id: '99', run_attempt: '2',
  event_name: 'pull_request_target', runner_environment: 'self-hosted',
  sub: '', jti: '', exp: now - 1, nbf: now + 1, iat: now - 601 })) {
  test(`signed wrong ${field} is rejected before REST metadata access`, async () => {
    let calls = 0;
    await assert.rejects(verifier(async () => { calls++; return run(); })(await sign({ [field]: bad })),
      isError('identity_rejected', 403));
    assert.equal(calls, 0);
  });
}

test('invalid signature, unsigned JWT, malformed/oversized tokens and missing required claim fail closed', async () => {
  const missing = claims(); delete missing.run_attempt;
  const missingToken = await new SignJWT(missing).setProtectedHeader({ alg: 'RS256', kid: 'fixture' }).sign(privateKey);
  const verify = verifier(() => assert.fail('must not read metadata'));
  for (const token of [await sign({}, otherPrivateKey), 'eyJhbGciOiJub25lIn0.e30.', 'invalid',
    'a'.repeat(16385), missingToken, await sign({ aud: [policy.audience, 'another'] })]) {
    await assert.rejects(verify(token), isError('identity_rejected', 403));
  }
});

test('independent metadata mismatch in each bound identity cannot authorize discovery', async () => {
  const mutations = [r => r.id++, r => r.run_attempt++, r => r.repository.id++, r => r.repository.owner.id++,
    r => r.repository.full_name = 'another/repo', r => r.head_repository.id++,
    r => r.head_repository.full_name = 'fork/repo', r => r.path = '.github/workflows/other.yml',
    r => r.head_branch = 'main', r => r.head_sha = '2'.repeat(40),
    r => r.status = 'completed', r => r.event = 'pull_request', r => r.repository.owner.login = 'other'];
  const token = await sign();
  for (const mutate of mutations) {
    const metadata = run(); mutate(metadata);
    await assert.rejects(verifier(async () => metadata)(token), isError('identity_rejected', 403));
  }
});

test('REST outage is 503 and recovers on a later independent read without cached success', async () => {
  let calls = 0;
  const verify = verifier(async () => { if (++calls === 1) throw new Error('private diagnostic'); return run(); });
  const token = await sign();
  await assert.rejects(verify(token), isError('run_metadata_unavailable', 503));
  assert.equal((await verify(token)).result, 'verified_discovery_identity');
  assert.equal(calls, 2);
});

test('JWKS outage is distinguishable from a rejected identity', async () => {
  const verify = createVerifier(policy, { getKey: async () => { throw new TypeError('private diagnostic'); },
    readRun: () => assert.fail('must not read metadata') });
  await assert.rejects(verify(await sign()), isError('identity_provider_unavailable', 503));
});

test('live run reader uses exact attempt, fixed HTTPS API, timeout and no redirects', async () => {
  assert.doesNotThrow(() => createRunReader('opaque-v2.token+suffix/with=padding'));
  for (const credential of ['', 'contains space', 'contains\r\nheader', 'x'.repeat(8193)]) {
    assert.throws(() => createRunReader(credential), /missing_or_invalid_read_token/);
  }
  const read = createRunReader('fixture_read_token', async (url, options) => {
    assert.equal(url, `https://api.github.com/repos/${policy.repository}/actions/runs/${policy.runId}/attempts/1`);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.Authorization, 'Bearer fixture_read_token');
    return Response.json(run());
  });
  assert.deepEqual(await read(policy), run());
  for (const response of [new Response('', { status: 401 }), new Response('x'.repeat(256 * 1024 + 1)),
    new Response('invalid-json')]) {
    await assert.rejects(createRunReader('fixture', async () => response)(policy));
  }
});

async function withServer(verify, fn) {
  const server = createProbeServer(verify);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const body = { schemaVersion: '1.0', probeId: 'synthetic-local-1' };
test('real loopback HTTP success, health and lack of operation/command endpoints', async () => {
  await withServer(verifier(), async base => {
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    for (const path of ['/v1/operations/example/claim', '/exec', '/healthz?target=arbitrary']) {
      assert.equal((await fetch(`${base}${path}`)).status, 404);
    }
    const response = await fetch(`${base}/v1/discovery/oidc-probe`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await sign()}` }, body: JSON.stringify(body) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).probeId, body.probeId);
    const token = await sign();
    for (const probeCase of ['wrong-repository', 'wrong-workflow', 'wrong-run', 'wrong-attempt']) {
      const denied = await fetch(`${base}/v1/discovery/oidc-probe`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...body, case: probeCase }) });
      assert.equal(denied.status, 403);
      assert.equal((await denied.json()).error, 'identity_rejected');
    }
  });
});

test('HTTP rejects invalid body/version/extra fields/size before verifier', async () => {
  await withServer(() => assert.fail('no verification on malformed input'), async base => {
    for (const [payload, status] of [['invalid', 400], [JSON.stringify({ ...body, schemaVersion: '2.0' }), 400],
      [JSON.stringify({ ...body, runId: 'attacker-run' }), 400], ['x'.repeat(4097), 413]]) {
      const response = await fetch(`${base}/v1/discovery/oidc-probe`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: payload });
      assert.equal(response.status, status);
    }
    const missingAuth = await fetch(`${base}/v1/discovery/oidc-probe`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(missingAuth.status, 403);
    // Chunked oversized data must yield JSON 413 rather than dropping the response.
    const result = await new Promise((resolve, reject) => {
      const req = httpRequest(`${base}/v1/discovery/oidc-probe`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, res => {
        let bytes = ''; res.on('data', chunk => bytes += chunk); res.on('end', () => resolve([res.statusCode, bytes]));
      });
      req.on('error', reject); req.write('x'.repeat(4097)); req.end();
    });
    assert.equal(result[0], 413);
    assert.equal(JSON.parse(result[1]).error, 'payload_too_large');
  });
});

test('HTTP exceptions never expose tokens or private diagnostics', async () => {
  await withServer(async () => { throw new Error('private diagnostic fixture-secret'); }, async base => {
    const response = await fetch(`${base}/v1/discovery/oidc-probe`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-secret' }, body: JSON.stringify(body) });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { schemaVersion: '1.0', error: 'probe_unavailable' });
  });
});
