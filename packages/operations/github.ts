import { createPrivateKey } from 'node:crypto';
import { SignJWT } from 'jose';
import { readProtected } from '../target-helper/filesystem.ts';
import type { Installation } from './installation.ts';
import { GitHubError } from '../core/github.ts';

export function credentialResolver(spec: Installation, transport: typeof fetch = fetch) {
  const tokens = new Map<string, { token: string; expires: number }>();
  return async (reference: string): Promise<string> => {
    const binding = spec.credentials[reference];
    if (!binding) throw new GitHubError('credential_unavailable');
    if (typeof binding === 'string') {
      const token = readProtected(binding, process.getuid!(), 8192).toString('utf8').trim();
      if (!token || /[\r\n\0]/.test(token)) throw new GitHubError('credential_unavailable');
      return token;
    }
    const cached = tokens.get(reference);
    if (cached && cached.expires > Date.now() + 60000) return cached.token;
    const key = createPrivateKey(readProtected(binding.keyFile));
    const jwt = await new SignJWT({}).setProtectedHeader({ alg: 'RS256' }).setIssuer(binding.appId)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 30).setExpirationTime('5m').sign(key);
    const response = await transport(`https://api.github.com/app/installations/${binding.installationId}/access_tokens`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { authorization: `Bearer ${jwt}`, accept: 'application/vnd.github+json', 'user-agent': 'Labstride', 'content-type': 'application/json' },
      body: JSON.stringify({ repository_ids: binding.repositoryIds, permissions: binding.permissions }),
    });
    if (!response.ok) throw new GitHubError('credential_unavailable');
    const payload = await response.json() as { token?: string; expires_at?: string };
    if (!payload.token || !payload.expires_at || !Number.isFinite(Date.parse(payload.expires_at))) throw new GitHubError('credential_unavailable');
    tokens.set(reference, { token: payload.token, expires: Date.parse(payload.expires_at) });
    return payload.token;
  };
}

export class GitHubRest {
  readonly credential: (reference: string) => Promise<string>;
  readonly reference: string;
  readonly transport: typeof fetch;
  constructor(credential: (reference: string) => Promise<string>, reference: string, transport: typeof fetch = fetch) {
    this.credential = credential; this.reference = reference; this.transport = transport;
  }
  async request(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<any> {
    if (!/^\/(repos\/|installation\/repositories)/.test(path) || path.includes('..') || /[\r\n#]/.test(path)) throw new GitHubError('invalid_configuration');
    let response: Response;
    try {
      response = await this.transport(`https://api.github.com${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { authorization: `Bearer ${await this.credential(this.reference)}`, accept: 'application/vnd.github+json',
          'user-agent': 'Labstride', 'content-type': 'application/json', 'x-github-api-version': '2022-11-28' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw new GitHubError(method === 'GET' ? 'provider_unavailable' : 'transport_unknown'); }
    if (!response.ok) throw new GitHubError(response.status === 401 ? 'credential_expired' : response.status === 403 ? 'permission_denied' : 'provider_unavailable');
    const reader = response.body?.getReader(); if (!reader) throw new GitHubError('invalid_provider_data');
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
      if (size > 2097152) { await reader.cancel(); throw new GitHubError('response_too_large'); } chunks.push(part.value); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new GitHubError('invalid_provider_data'); }
  }
  async installationRepositories(expected: string[]): Promise<void> {
    const ids: string[] = [];
    for (let page = 1; page <= 10; page++) {
      const value = await this.request('GET', `/installation/repositories?per_page=100&page=${page}`);
      if (!Array.isArray(value.repositories)) throw new GitHubError('installation_credential_required');
      ids.push(...value.repositories.map((repo: any) => String(repo.node_id)));
      if (ids.length >= value.total_count) {
        if (!expected.every(id => ids.includes(id)) || ids.length !== expected.length) throw new GitHubError('repository_scope_mismatch');
        return;
      }
    }
    throw new GitHubError('repository_page_limit');
  }
}
