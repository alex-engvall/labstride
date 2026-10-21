import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runClient } from '../tools/oidc-probe/runner-client.mjs';

const options = {
  endpoint: 'https://probe.example.invalid/v1/discovery/oidc-probe', audience: 'urn:example:probe',
  renewalDelayMs: 0,
  env: { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example.invalid/idtoken?api-version=2.0',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture_runner_secret', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' },
};
function fixture({ same = false, change = result => result } = {}) {
  const calls = [];
  let issued = 0;
  return { calls, fetcher: async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    if (new URL(url).hostname === 'oidc.example.invalid') {
      assert.equal(init.headers.Authorization, 'Bearer fixture_runner_secret');
      if (new URL(url).searchParams.get('audience').endsWith(':wrong')) return Response.json({ value: 'wrong.audience.jwt' });
      return Response.json({ value: same || ++issued === 1 ? 'first.fixture.jwt' : 'second.fixture.jwt' });
    }
    const body = JSON.parse(init.body);
    assert.deepEqual(Object.keys(body).sort(), ['probeId', 'schemaVersion']);
    if (init.headers.Authorization === 'Bearer wrong.audience.jwt') {
      return Response.json({ schemaVersion: '1.0', error: 'identity_rejected' }, { status: 403 });
    }
    return Response.json(change({ schemaVersion: '1.0', result: 'verified_discovery_identity',
      runId: '123', runAttempt: '1', token: { issuedAt: issued > 1 ? 1065 : 1000, notBefore: 1000, expiresAt: 1300 },
      claimNames: ['aud', 'run_id'], verified: { signature: true, policy: true, independentRunAttempt: true },
      arbitrary: 'private remote content must not be copied' }));
  } };
}

test('runner fixture requests signed identity three times and reports only bounded evidence', async () => {
  const f = fixture();
  const result = await runClient({ ...options, ...f });
  assert.equal(f.calls.length, 6);
  assert.equal(result.wrongAudience.status, 403);
  assert.equal(result.renewal.sameToken, false);
  assert.equal(result.renewal.issuedAtAdvanced, true);
  assert.ok(!JSON.stringify(result).includes('jwt'));
  assert.ok(!JSON.stringify(result).includes('private remote'));
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('same token on second request is preserved as an observation, not invented renewal', async () => {
  const result = await runClient({ ...options, ...fixture({ same: true }) });
  assert.equal(result.renewal.sameToken, true);
  assert.equal(result.renewal.issuedAtAdvanced, false);
});

test('runner rejects insecure/credential-bearing URLs and missing identity before network access', async () => {
  for (const patch of [{ endpoint: 'http://probe.example.invalid/v1/discovery/oidc-probe' },
    { endpoint: 'https://user:password@probe.example.invalid/v1/discovery/oidc-probe' },
    { endpoint: 'https://probe.example.invalid/exec' }, { audience: 'contains newline\n' },
    { env: { ...options.env, ACTIONS_ID_TOKEN_REQUEST_TOKEN: undefined } }]) {
    await assert.rejects(runClient({ ...options, ...patch, fetcher: () => assert.fail('no network') }));
  }
});

test('runner rejects unrelated runs, unverified metadata and malformed remote success', async () => {
  for (const change of [r => ({ ...r, runId: '456' }), r => ({ ...r, runAttempt: '2' }),
    r => ({ ...r, verified: { ...r.verified, independentRunAttempt: false } }),
    r => ({ ...r, token: { issuedAt: 'secret' } }), r => ({ ...r, claimNames: ['invalid claim\n'] })]) {
    await assert.rejects(runClient({ ...options, ...fixture({ change }) }), /invalid_probe_evidence/);
  }
});

test('runner does not retry ambiguous errors or print arbitrary remote failures', async () => {
  let calls = 0;
  await assert.rejects(runClient({ ...options, fetcher: async () => {
    calls++; return new Response('private diagnostic', { status: 503 });
  } }), /oidc_request_failed/);
  assert.equal(calls, 1);
});
