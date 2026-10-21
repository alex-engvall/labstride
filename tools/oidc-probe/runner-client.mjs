import { pathToFileURL } from 'node:url';

async function json(response, limit = 32 * 1024) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error('oversized_response');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Runs only inside an explicitly authorized synthetic Actions job; logs no tokens. */
export async function runClient({ endpoint, audience, renewalDelayMs = 65000,
  env = process.env, fetcher = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const destination = new URL(endpoint);
  const oidc = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  if ([destination, oidc].some(url => url.protocol !== 'https:' || url.username || url.password || url.hash)
    || destination.pathname !== '/v1/discovery/oidc-probe' || destination.search
    || typeof audience !== 'string' || !/^[!-~]{1,240}$/.test(audience)
    || !Number.isInteger(renewalDelayMs) || renewalDelayMs < 0 || renewalDelayMs > 600000
    || !/^[\w-]{1,32}$/.test(env.GITHUB_RUN_ID ?? '')
    || !/^[\w-]{1,8}$/.test(env.GITHUB_RUN_ATTEMPT ?? '')
    || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) throw new Error('invalid_runner_configuration');
  const token = async requestedAudience => {
    const url = new URL(oidc);
    url.searchParams.set('audience', requestedAudience);
    const response = await fetcher(url.href, { redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } });
    if (response.status !== 200) throw new Error('oidc_request_failed');
    const value = (await json(response)).value;
    if (typeof value !== 'string' || value.length > 16384 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(value)) {
      throw new Error('invalid_oidc_response');
    }
    return value;
  };
  const send = async (value, suffix, expected) => {
    const response = await fetcher(destination.href, { method: 'POST', redirect: 'error',
      signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${value}` },
      body: JSON.stringify({ schemaVersion: '1.0', probeId: `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}-${suffix}` }) });
    const result = await json(response);
    if (response.status !== expected || result.schemaVersion !== '1.0') throw new Error('probe_unexpected_result');
    if (expected === 403) {
      if (result.error !== 'identity_rejected') throw new Error('probe_unexpected_rejection');
      return { status: 403, error: 'identity_rejected' };
    }
    if (result.result !== 'verified_discovery_identity' || result.runId !== env.GITHUB_RUN_ID
      || result.runAttempt !== env.GITHUB_RUN_ATTEMPT
      || !['issuedAt', 'notBefore', 'expiresAt'].every(key => Number.isSafeInteger(result.token?.[key]))
      || !Array.isArray(result.claimNames) || result.claimNames.length > 128
      || !result.claimNames.every(name => typeof name === 'string' && /^[A-Za-z0-9_]{1,128}$/.test(name))
      || !['signature', 'policy', 'independentRunAttempt'].every(key => result.verified?.[key] === true)) {
      throw new Error('invalid_probe_evidence');
    }
    // Select only evidence fields. Never print an arbitrary remote response/error.
    return { status: 200, token: { issuedAt: result.token.issuedAt,
      notBefore: result.token.notBefore, expiresAt: result.token.expiresAt }, claimNames: result.claimNames };
  };
  const firstToken = await token(audience);
  const first = await send(firstToken, 'first', 200);
  const wrongAudience = await send(await token(`${audience}:wrong`), 'wrong-audience', 403);
  await sleep(renewalDelayMs);
  const secondToken = await token(audience);
  const second = await send(secondToken, 'second', 200);
  return { schemaVersion: '1.0', probe: 'W00.2-runner-oidc', runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT, first, wrongAudience, second,
    renewal: { delayMs: renewalDelayMs, sameToken: firstToken === secondToken,
      issuedAtAdvanced: second.token.issuedAt > first.token.issuedAt } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runClient({ endpoint: process.env.LABSTRIDE_PROBE_ENDPOINT,
      audience: process.env.LABSTRIDE_PROBE_AUDIENCE });
    console.log(JSON.stringify(result));
  } catch {
    console.error('oidc_discovery_failed_no_tokens_logged');
    process.exitCode = 1;
  }
}
