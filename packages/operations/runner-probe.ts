import { writeFileSync, openSync, closeSync, fsyncSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RequestListener } from 'node:http';
import { createVerifier } from '../../tools/oidc-probe/probe.mjs';
import { digest } from '../configuration/json.ts';
import { readProtected, protectedPath } from '../target-helper/filesystem.ts';
import { validated } from '../storage-sqlite/validation.ts';
import type { Installation } from './installation.ts';
import { isPublic, installationDependencies } from './installation.ts';
import type { RunnerProbeEvidenceV1 } from '../../contracts/generated/runner-probe-evidence.ts';

export function probeBinding(spec: Installation): string {
  // Enablement itself must not invalidate qualification of a disabled installation.
  return digest({ ...spec, configuration: { ...spec.configuration, enabled: false } });
}
export function probeReady(spec: Installation, now = Date.now()): boolean {
  if (!isPublic(spec) || !spec.brokerProbe || spec.configuration.broker.enabled === false) return false;
  try {
    const evidence = validated('runner-probe-evidence', JSON.parse(readProtected(join(spec.stateDirectory, 'runner-probe.json')).toString('utf8')) as RunnerProbeEvidenceV1);
    const age = now - Date.parse(evidence.observedAt);
    return evidence.bindingDigest === probeBinding(spec) && age >= 0 && age <= (spec.brokerProbe.maxAgeSeconds ?? 86400) * 1000 &&
      evidence.runId === spec.brokerProbe.policy.runId && evidence.runAttempt === spec.brokerProbe.policy.runAttempt;
  } catch { return false; }
}
export function saveProbe(spec: Installation, probeId: string, now = new Date().toISOString()): void {
  if (!isPublic(spec) || !spec.brokerProbe) throw Error('probe_policy_missing');
  protectedPath(spec.stateDirectory);
  const destination = join(spec.stateDirectory, 'runner-probe.json');
  try { readProtected(destination); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const evidence = validated('runner-probe-evidence', { schemaVersion: '1.0', bindingDigest: probeBinding(spec), observedAt: now,
    probeId, runId: spec.brokerProbe.policy.runId, runAttempt: spec.brokerProbe.policy.runAttempt });
  const temporary = join(spec.stateDirectory, `runner-probe-${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify(evidence), { flag: 'wx', mode: 0o600 });
  const fd = openSync(temporary, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, destination);
  const directory = openSync(spec.stateDirectory, 'r'); try { fsyncSync(directory); } finally { closeSync(directory); }
}
export function runnerDiagnostics(spec: Installation, dependencies?: Parameters<typeof createVerifier>[1]): RequestListener | undefined {
  if (!isPublic(spec) || !spec.brokerProbe || spec.configuration.broker.enabled === false) return;
  if (spec.brokerProbe.policy.audience !== spec.configuration.broker.oidcAudience ||
    !spec.configuration.github.repositories.includes(spec.brokerProbe.policy.repository)) throw Error('probe_policy_mismatch');
  const { rest } = installationDependencies(spec);
  const verify = createVerifier(spec.brokerProbe.policy, dependencies ?? {
    readRun: (policy: typeof spec.brokerProbe.policy) => rest.request('GET', `/repos/${policy.repository}/actions/runs/${policy.runId}/attempts/${policy.runAttempt}`),
  });
  return async (request, response) => {
    const reply = (status: number, value: object) => {
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', connection: 'close' });
      response.end(JSON.stringify({ schemaVersion: '1.0', ...value }));
    };
    if (request.method === 'GET' && request.url === '/v1/diagnostics/status') {
      reply(200, { service: 'labstride-runner-diagnostics', bindingDigest: probeBinding(spec) }); return;
    }
    if (request.method !== 'POST' || request.url !== '/v1/discovery/oidc-probe') { reply(404, { error: 'not_found' }); return; }
    try {
      if (request.headers['content-type'] !== 'application/json' || request.headers['content-encoding']) { reply(400, { error: 'invalid_payload' }); return; }
      const authorization = /^Bearer ([\w.-]{1,16384})$/.exec(request.headers.authorization ?? '');
      if (!authorization) { reply(403, { error: 'identity_rejected' }); return; }
      let size = 0; const parts: Buffer[] = [];
      for await (const part of request.iterator({ destroyOnReturn: false })) {
        size += part.length; if (size > 4096) { reply(413, { error: 'payload_too_large' }); return; } parts.push(Buffer.from(part));
      }
      let body: import('../../contracts/generated/runner-probe-request.ts').RunnerDiagnosticRequestV1;
      try { body = validated('runner-probe-request', JSON.parse(Buffer.concat(parts).toString('utf8'))); }
      catch { reply(400, { error: 'invalid_payload' }); return; }
      const result = await verify(authorization[1], body.case ?? 'positive');
      saveProbe(spec, body.probeId);
      reply(200, { ...result as object, probeId: body.probeId });
    } catch (error) {
      const code = (error as { code?: string }).code;
      const status = (error as { status?: number }).status;
      const allowed = ['identity_rejected','identity_provider_unavailable','run_metadata_unavailable','invalid_payload'];
      reply(status === 403 ? 403 : status === 400 ? 400 : 503, { error: allowed.includes(code ?? '') ? code : 'probe_unavailable' });
    }
  };
}

export async function brokerReachable(spec: Installation, transport: typeof fetch = fetch): Promise<boolean> {
  if (spec.configuration.broker.enabled === false) return false;
  const url = new URL('/v1/diagnostics/status', spec.configuration.broker.url);
  const response = await transport(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) return false;
  const reader = response.body?.getReader(); if (!reader) return false;
  const parts: Uint8Array[] = []; let size = 0;
  for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 4096) { await reader.cancel(); return false; } parts.push(part.value); }
  const result = JSON.parse(Buffer.concat(parts).toString('utf8'));
  return result.schemaVersion === '1.0' && result.service === 'labstride-runner-diagnostics' && result.bindingDigest === probeBinding(spec);
}
