import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const ISSUER = 'https://token.actions.githubusercontent.com';
const ajv = new Ajv2020({ strict: true });
const compile = name => ajv.compile(JSON.parse(readFileSync(new URL(name, import.meta.url))));
const checkPolicy = compile('config.schema.json');
const checkRequest = compile('request.schema.json');
const checkResponse = compile('response.schema.json');
const MAX_BODY = 4096;
const MAX_TOKEN = 16384;

/**
 * @typedef {{schemaVersion:'1.0', audience:string, repository:string, repositoryId:string,
 * ownerId:string, workflowPath:string, ref:string, workflowSha:string, runId:string,
 * runAttempt:string, eventName:'push'}} ProbePolicy
 * @typedef {{schemaVersion:'1.0', probeId:string}} ProbeRequest
 */

/**
 * Discovery policy is deliberately restricted to one push run and attempt.
 * @param {unknown} value
 * @returns {Readonly<ProbePolicy>}
 */
export function validatePolicy(value) {
  if (!checkPolicy(value)) throw new Error('invalid_probe_policy');
  return Object.freeze(structuredClone(value));
}

export class ProbeError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
const forbidden = () => new ProbeError('identity_rejected', 403);

/**
 * Verify a signed token, then independently observe the exact run attempt.
 * getKey/readRun are explicit test seams; CLI always uses GitHub's fixed endpoints.
 * No claim, receipt, token persistence, command execution or operation effect exists.
 * @param {ProbePolicy} policyValue installation-local policy; always validated again
 * @param {{getKey?: Function, readRun: Function, currentDate?: Date}} dependencies
 */
export function createVerifier(policyValue, { getKey, readRun, currentDate } = {}) {
  const policy = validatePolicy(policyValue);
  if (typeof readRun !== 'function') throw new Error('missing_run_reader');
  const key = getKey ?? createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`), {
    timeoutDuration: 5000, cooldownDuration: 30000,
  });
  return async token => {
    if (typeof token !== 'string' || token.length > MAX_TOKEN || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
      throw forbidden();
    }
    let claims;
    try {
      ({ payload: claims } = await jwtVerify(token, key, {
        issuer: ISSUER, audience: policy.audience, algorithms: ['RS256'],
        requiredClaims: ['sub', 'jti', 'iat', 'nbf', 'exp', 'repository', 'repository_id',
          'repository_owner_id', 'workflow_ref', 'workflow_sha', 'ref', 'sha',
          'run_id', 'run_attempt', 'event_name', 'runner_environment'],
        maxTokenAge: '10 minutes', clockTolerance: 0, currentDate,
      }));
    } catch (error) {
      // A key-fetch outage cannot establish an invalid identity. Keep it retryable.
      if (['ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID', 'ERR_JOSE_GENERIC'].includes(error.code)
        || error instanceof TypeError || error.name === 'AbortError') {
        throw new ProbeError('identity_provider_unavailable', 503);
      }
      throw forbidden();
    }
    const expected = {
      repository: policy.repository, repository_id: policy.repositoryId,
      repository_owner_id: policy.ownerId,
      workflow_ref: `${policy.repository}/${policy.workflowPath}@${policy.ref}`,
      workflow_sha: policy.workflowSha, ref: policy.ref, sha: policy.workflowSha,
      run_id: policy.runId, run_attempt: policy.runAttempt, event_name: policy.eventName,
      runner_environment: 'github-hosted',
    };
    if (Object.entries(expected).some(([key, value]) => claims[key] !== value)
      || claims.aud !== policy.audience || typeof claims.sub !== 'string' || !claims.sub
      || typeof claims.jti !== 'string' || !claims.jti
      || ![claims.iat, claims.nbf, claims.exp].every(Number.isSafeInteger)
      || claims.exp <= claims.iat || claims.nbf > claims.iat) throw forbidden();
    let run;
    try { run = await readRun(policy); }
    catch { throw new ProbeError('run_metadata_unavailable', 503); }
    // Use the attempt-specific REST endpoint. No coercion of unsafe numeric IDs.
    const id = value => Number.isSafeInteger(value) && value > 0 ? String(value) : null;
    const owner = policy.repository.split('/')[0];
    if (!run || id(run.id) !== policy.runId || id(run.run_attempt) !== policy.runAttempt
      || id(run.repository?.id) !== policy.repositoryId
      || id(run.repository?.owner?.id) !== policy.ownerId
      || run.repository?.full_name !== policy.repository
      || id(run.head_repository?.id) !== policy.repositoryId
      || run.head_repository?.full_name !== policy.repository
      || run.path !== policy.workflowPath || run.event !== policy.eventName
      || run.head_branch !== policy.ref.slice('refs/heads/'.length)
      || run.head_sha !== policy.workflowSha || run.status !== 'in_progress'
      || run.repository?.owner?.login !== owner) throw forbidden();
    return {
      schemaVersion: '1.0', result: 'verified_discovery_identity',
      repositoryId: policy.repositoryId, runId: policy.runId, runAttempt: policy.runAttempt,
      workflowSha: policy.workflowSha,
      token: { issuedAt: claims.iat, notBefore: claims.nbf, expiresAt: claims.exp },
      // Availability, not values, for optional/reusable-workflow claims.
      claimNames: Object.keys(claims).sort(),
      verified: { signature: true, policy: true, independentRunAttempt: true },
    };
  };
}

/** Fixed GitHub origin, no redirect or request-controlled repository/run URL. */
export function createRunReader(token, fetcher = fetch) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_]+$/.test(token)) throw new Error('missing_or_invalid_read_token');
  return async policy => {
    const url = `https://api.github.com/repos/${policy.repository}/actions/runs/${policy.runId}/attempts/${policy.runAttempt}`;
    const response = await fetcher(url, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (response.status !== 200) throw new Error('run_read_failed');
    return JSON.parse(await boundedBody(response.body, 256 * 1024));
  };
}

async function boundedBody(stream, limit) {
  const buffers = [];
  let size = 0;
  const iterable = typeof stream.iterator === 'function' ? stream.iterator({ destroyOnReturn: false }) : stream;
  for await (const chunk of iterable) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) { stream.pause?.(); throw new ProbeError('payload_too_large', 413); }
    buffers.push(buffer);
  }
  return Buffer.concat(buffers).toString('utf8');
}

/** Versioned JSON over HTTP on loopback; operator-owned HTTPS ingress is separate. */
export function createProbeServer(verify) {
  const server = createServer({ maxHeaderSize: 24 * 1024 }, async (request, response) => {
    const reply = (status, body) => {
      body = { schemaVersion: '1.0', ...body };
      if (!checkResponse(body)) { status = 503; body = { schemaVersion: '1.0', error: 'probe_unavailable' }; }
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', Connection: 'close' });
      response.end(JSON.stringify(body));
    };
    try {
      if (request.method === 'GET' && request.url === '/healthz') {
        reply(200, { service: 'labstride-oidc-discovery', ready: true }); return;
      }
      if (request.method !== 'POST' || request.url !== '/v1/discovery/oidc-probe') {
        reply(404, { error: 'not_found' }); return;
      }
      if (request.headers['content-type'] !== 'application/json') {
        throw new ProbeError('invalid_payload', 400);
      }
      const length = request.headers['content-length'];
      if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) {
        throw new ProbeError('payload_too_large', 413);
      }
      let body;
      try { body = JSON.parse(await boundedBody(request, MAX_BODY)); }
      catch (error) {
        if (error instanceof ProbeError) throw error;
        throw new ProbeError('invalid_payload', 400);
      }
      if (!checkRequest(body)) throw new ProbeError('invalid_payload', 400);
      const match = /^Bearer ([\w.-]+)$/.exec(request.headers.authorization ?? '');
      if (!match || match[1].length > MAX_TOKEN) throw forbidden();
      reply(200, { ...(await verify(match[1])), probeId: body.probeId });
    } catch (error) {
      if (error instanceof ProbeError) reply(error.status, { error: error.code });
      else reply(503, { error: 'probe_unavailable' });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.timeout = 10000;
  return server;
}
