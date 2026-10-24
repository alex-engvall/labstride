import { BrokerError, workflowRunName } from '../core/workflow-broker.ts';
import type { Enrollment, Operation, WorkflowProvider, WorkflowRun } from '../core/workflow-broker.ts';

const denied = () => new BrokerError('identity_rejected', 403);
const unavailable = () => new BrokerError('provider_unavailable', 503);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw unavailable();
  return value as Record<string, unknown>;
}
function text(value: unknown): string { if (typeof value !== 'string' || !value || value.length > 4096) throw unavailable(); return value; }
function id(value: unknown): string {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw unavailable();
  return String(value);
}
export function normalizeWorkflowRun(value: unknown): WorkflowRun {
  const run = object(value), repository = object(run.repository), owner = object(repository.owner), head = object(run.head_repository);
  if (id(head.id) !== id(repository.id) || head.full_name !== repository.full_name) throw denied();
  return { runId: id(run.id), runAttempt: Number(id(run.run_attempt)), repositoryId: id(repository.id),
    repositoryNodeId: text(repository.node_id), repository: text(repository.full_name), ownerId: id(owner.id),
    workflowId: id(run.workflow_id), workflowPath: text(run.path), refName: text(run.head_branch),
    workflowSha: text(run.head_sha), event: text(run.event), status: text(run.status),
    conclusion: run.conclusion === null ? null : text(run.conclusion), name: text(run.display_title), createdAt: text(run.created_at) };
}
export class GitHubWorkflowProvider implements WorkflowProvider {
  readonly #credential: (reference: string) => Promise<string>;
  readonly #fetch: typeof fetch;
  constructor(credential: (reference: string) => Promise<string>, transport: typeof fetch = fetch) {
    this.#credential = credential; this.#fetch = transport;
  }
  async request(enrollment: Enrollment, method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    if (!/^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/|$)/.test(path) || path.includes('..') || /[\r\n#]/.test(path)) throw unavailable();
    let response: Response;
    try {
      const credential = await this.#credential(enrollment.credentialRef);
      if (!/^[!-~]{1,8192}$/.test(credential)) throw unavailable();
      response = await this.#fetch(`https://api.github.com${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { authorization: `Bearer ${credential}`, accept: 'application/vnd.github+json', 'content-type': 'application/json',
          'user-agent': 'Labstride', 'x-github-api-version': '2022-11-28' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw unavailable(); }
    if (!response.ok) throw unavailable();
    if (response.status === 204) return null;
    const reader = response.body?.getReader(); if (!reader) throw unavailable();
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.length;
      if (size > 2097152) { await reader.cancel(); throw unavailable(); }
      chunks.push(part.value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw unavailable(); }
  }
  async preflight(enrollment: Enrollment, op: Operation): Promise<void> {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(op.source.repository)) throw denied();
    const base = `/repos/${enrollment.repository.name}`;
    const repo = object(await this.request(enrollment, 'GET', `${base}/actions/workflows/${enrollment.workflowId}`));
    if (id(repo.id) !== enrollment.workflowId || repo.path !== enrollment.workflowPath || repo.state !== 'active') throw denied();
    // Repository metadata establishes the explicit GraphQL-node / OIDC-numeric mapping.
    const identities = [enrollment.repository, { name: op.source.repository, nodeId: op.source.repositoryId }];
    for (const expected of identities) {
      const actual = object(await this.request(enrollment, 'GET', `/repos/${expected.name}`));
      if (actual.node_id !== expected.nodeId || actual.full_name !== expected.name ||
        'id' in expected && (id(actual.id) !== expected.id || id(object(actual.owner).id) !== expected.ownerId)) throw denied();
    }
    const ref = object(await this.request(enrollment, 'GET', `${base}/commits/${encodeURIComponent(enrollment.ref)}`));
    if (ref.sha !== enrollment.workflowSha) throw denied();
    const source = object(await this.request(enrollment, 'GET', `/repos/${op.source.repository}/commits/${op.source.sha}`));
    if (source.sha !== op.source.sha) throw denied();
  }
  async dispatch(enrollment: Enrollment, op: Operation): Promise<string | null> {
    const result = await this.request(enrollment, 'POST', `/repos/${enrollment.repository.name}/actions/workflows/${enrollment.workflowId}/dispatches`, {
      ref: enrollment.ref, return_run_details: true,
      inputs: { operation_id: op.operationId, request_digest: op.requestDigest, schema_version: '1.0' },
    });
    return result === null ? null : id(object(result).workflow_run_id);
  }
  async run(enrollment: Enrollment, runId: string, attempt: number): Promise<WorkflowRun> {
    if (!/^[1-9][0-9]{0,31}$/.test(runId) || !Number.isSafeInteger(attempt) || attempt < 1) throw denied();
    return normalizeWorkflowRun(await this.request(enrollment, 'GET', `/repos/${enrollment.repository.name}/actions/runs/${runId}/attempts/${attempt}`));
  }
  async find(enrollment: Enrollment, op: Operation, submittedAt: string): Promise<WorkflowRun[]> {
    const matches: WorkflowRun[] = [];
    const seen = new Set<string>();
    let total: number | undefined;
    const created = encodeURIComponent(`>=${new Date(Date.parse(submittedAt) - 5000).toISOString()}`);
    // Hitting the search limit is incomplete evidence, never proof of absence.
    for (let page = 1; page <= 10; page++) {
      const result = object(await this.request(enrollment, 'GET', `/repos/${enrollment.repository.name}/actions/workflows/${enrollment.workflowId}/runs?event=workflow_dispatch&created=${created}&per_page=100&page=${page}`));
      if (!Array.isArray(result.workflow_runs) || !Number.isSafeInteger(result.total_count) || Number(result.total_count) > 1000) throw unavailable();
      if (Number(result.total_count) < 0 || total !== undefined && total !== result.total_count) throw unavailable();
      total = Number(result.total_count);
      for (const candidate of result.workflow_runs) {
        const raw = object(candidate);
        const runId = id(raw.id);
        if (seen.has(runId)) throw unavailable();
        seen.add(runId);
        if (raw.display_title === workflowRunName(op)) matches.push(normalizeWorkflowRun(candidate));
      }
      if (seen.size === total) return matches;
      if (seen.size > total || result.workflow_runs.length < 100) throw unavailable();
    }
    throw unavailable();
  }
}
