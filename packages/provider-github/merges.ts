import { digest } from '../configuration/json.ts';
import { validated } from '../storage-sqlite/validation.ts';
import { MergeBlocked } from '../core/merges.ts';
import type { MergeEnrollment, MergeInput, MergeEvidence, MergeProvider, MergeObservation, MergeQualification } from '../core/merges.ts';

// Only installation-owned code supplies this binding; a token file or payload
// cannot assert that it is a dedicated App installation credential.
export interface MergeCredentialIdentity { appId: number; installationId: number; repositoryIds: number[]; contents: 'write' }
export interface MergeGitHubOptions {
  credential(reference: string): Promise<string>;
  identity(reference: string): MergeCredentialIdentity | null;
  fetch?: typeof fetch;
  apiUrl?: string;
}
const object = (value: any): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MergeBlocked('merge_provider_data_invalid');
  return value;
};
const array = (value: any): any[] => { if (!Array.isArray(value)) throw new MergeBlocked('merge_provider_data_invalid'); return value; };
const sha = (value: any): string => { if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) throw new MergeBlocked('merge_provider_data_invalid'); return value; };
const id = (value: any): number => { if (!Number.isSafeInteger(value) || value < 1) throw new MergeBlocked('merge_provider_data_invalid'); return value; };

export class GitHubMergeProvider implements MergeProvider {
  readonly options: MergeGitHubOptions;
  readonly api: string;
  constructor(options: MergeGitHubOptions) {
    this.options = options; this.api = options.apiUrl ?? 'https://api.github.com';
    const url = new URL(this.api);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || this.api.endsWith('/')) throw new MergeBlocked('merge_configuration_invalid');
  }
  private identity(e: MergeEnrollment): void {
    const identity = this.options.identity(e.credentialRef);
    if (!identity || identity.appId !== e.appId || identity.installationId !== e.installationId || identity.contents !== 'write' ||
      !identity.repositoryIds.includes(e.repository.id)) throw new MergeBlocked('merge_credential_not_qualified');
  }
  private async request(reference: string, method: 'GET' | 'PUT', path: string, body?: unknown): Promise<any> {
    if (!path.startsWith('/repos/') || /[\r\n#]/.test(path) || /(?:^|\/)\.\.(?:\/|$)/.test(path)) throw new MergeBlocked('merge_configuration_invalid');
    let response: Response;
    try {
      const token = await this.options.credential(reference);
      if (!token) throw Error();
      response = await (this.options.fetch ?? fetch)(this.api + path, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json',
          'user-agent': 'Labstride', 'x-github-api-version': '2022-11-28' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw new MergeBlocked(method === 'GET' ? 'merge_provider_unavailable' : 'merge_outcome_unknown'); }
    // These direct-merge responses establish rejection, not permission to retry.
    if (method === 'PUT' && [405,409,422].includes(response.status)) return { merged: false, sha: null };
    if (!response.ok) throw new MergeBlocked(response.status === 403 ? 'merge_permission_denied' : 'merge_provider_unavailable');
    const reader = response.body?.getReader(); if (!reader) throw new MergeBlocked('merge_provider_data_invalid');
    const chunks: Uint8Array[] = []; let length = 0;
    for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.length;
      if (length > 2097152) { await reader.cancel(); throw new MergeBlocked('merge_response_too_large'); } chunks.push(part.value); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new MergeBlocked('merge_provider_data_invalid'); }
  }
  private path(e: MergeEnrollment) { return `/repos/${e.repository.name}`; }
  private async pages(e: MergeEnrollment, endpoint: string, property?: string, reference = e.credentialRef): Promise<any[]> {
    const result: any[] = [];
    for (let page = 1; page <= 10; page++) {
      const payload = await this.request(reference, 'GET', this.path(e) + endpoint + (endpoint.includes('?') ? '&' : '?') + `per_page=100&page=${page}`);
      const rows = array(property ? object(payload)[property] : payload);
      if (rows.length > 100) throw new MergeBlocked('merge_provider_data_invalid');
      result.push(...rows);
      if (rows.length < 100) {
        if (property && (!Number.isSafeInteger(payload.total_count) || payload.total_count !== result.length)) throw new MergeBlocked('merge_inventory_incomplete');
        return result;
      }
    }
    throw new MergeBlocked('merge_inventory_incomplete');
  }
  private async pr(e: MergeEnrollment, input: MergeInput): Promise<any> {
    const pr = object(await this.request(e.credentialRef, 'GET', `${this.path(e)}/pulls/${input.pullRequest}`));
    if (pr.number !== input.pullRequest || pr.base?.repo?.node_id !== e.repository.nodeId || pr.base.repo.id !== e.repository.id ||
      pr.head?.repo?.node_id !== e.repository.nodeId || pr.head.repo.id !== e.repository.id || pr.base?.ref !== e.baseBranch ||
      sha(pr.head?.sha) !== input.expectedHead) throw new MergeBlocked('merge_identity_mismatch');
    sha(pr.base.sha);
    return pr;
  }
  private async base(e: MergeEnrollment, expected: string): Promise<void> {
    const value = object(await this.request(e.credentialRef, 'GET', `${this.path(e)}/git/ref/heads/${encodeURIComponent(e.baseBranch)}`));
    if (value.ref !== `refs/heads/${e.baseBranch}` || value.object?.type !== 'commit' || value.object?.sha !== expected)
      throw new MergeBlocked('merge_base_not_current');
  }
  private async protections(e: MergeEnrollment): Promise<{ digest: string; checks: { context: string; appId: number | null }[] }> {
    const branch = encodeURIComponent(e.baseBranch), reference = e.protectionCredentialRef;
    // A 404 or 403 cannot establish that classic protection is absent. The first
    // profile requires a readable classic rule AND inventories all active rulesets.
    const classic = object(await this.request(reference, 'GET', `${this.path(e)}/branches/${branch}/protection`));
    if (classic.enforce_admins?.enabled !== true || classic.required_status_checks?.strict !== true ||
      classic.allow_force_pushes?.enabled !== false || classic.allow_deletions?.enabled !== false ||
      classic.required_pull_request_reviews === undefined) throw new MergeBlocked('merge_protections_unsupported');
    const bypass = classic.required_pull_request_reviews?.bypass_pull_request_allowances;
    if (bypass && (array(bypass.apps).some(app => id(app.id) === e.appId) || array(bypass.users).some(user => id(user.id) === e.actorId) || array(bypass.teams).length))
      throw new MergeBlocked('merge_bypass_not_allowed');
    const checks: { context: string; appId: number | null }[] = [];
    const add = (context: any, app: any) => {
      if (typeof context !== 'string' || !context || context.length > 1024) throw new MergeBlocked('merge_provider_data_invalid');
      checks.push({ context, appId: app === undefined || app === null || app === -1 ? null : id(app) });
    };
    const status = object(classic.required_status_checks);
    for (const check of array(status.checks)) add(check.context, check.app_id);
    for (const context of array(status.contexts)) if (!checks.some(check => check.context === context)) add(context, null);
    const rules = await this.pages(e, `/rules/branches/${branch}`, undefined, reference);
    const ruleSets: any[] = [];
    const supported = new Set(['required_status_checks','pull_request','non_fast_forward','deletion','required_linear_history','required_signatures','required_conversation_resolution']);
    const seen = new Set<number>();
    for (const rule of rules) {
      if (!supported.has(rule.type)) throw new MergeBlocked('merge_protections_unsupported');
      const rulesetId = id(rule.ruleset_id);
      if (!seen.has(rulesetId)) {
        seen.add(rulesetId);
        const set = object(await this.request(reference, 'GET', `${this.path(e)}/rulesets/${rulesetId}?includes_parents=true`));
        if (set.id !== rulesetId || set.enforcement !== 'active') throw new MergeBlocked('merge_inventory_incomplete');
        for (const actor of array(set.bypass_actors)) {
          if (actor.actor_type !== 'Integration' || actor.actor_id === e.appId) throw new MergeBlocked('merge_bypass_not_allowed');
          id(actor.actor_id);
        }
        ruleSets.push(set);
      }
      if (rule.type === 'required_status_checks') for (const check of array(rule.parameters?.required_status_checks)) add(check.context, check.integration_id);
    }
    if (!checks.length || e.checks.some(required => !checks.some(check => check.context === required.context && (check.appId === null || check.appId === required.appId))))
      throw new MergeBlocked('merge_required_checks_not_enforced');
    return { digest: digest({ classic, rules, ruleSets }), checks };
  }
  private async workflowBlob(e: MergeEnrollment, workflow: MergeEnrollment['workflows'][number], ref: string): Promise<void> {
    const value = object(await this.request(e.credentialRef, 'GET', `${this.path(e)}/contents/${workflow.path}?ref=${encodeURIComponent(ref)}`));
    if (value.type !== 'file' || value.path !== workflow.path || value.sha !== workflow.blobSha) throw new MergeBlocked('merge_workflow_changed');
  }
  async gate(e: MergeEnrollment, input: MergeInput): Promise<MergeEvidence> {
    validated('merge-enrollment', e); validated('merge-input', input); this.identity(e);
    const qualification = await this.qualify(e, e.qualification.mergeSha, e.qualification.runId);
    if (!qualification.qualified) throw new MergeBlocked('merge_downstream_not_qualified');
    const repo = object(await this.request(e.credentialRef, 'GET', this.path(e)));
    if (repo.id !== e.repository.id || repo.node_id !== e.repository.nodeId || repo.full_name !== e.repository.name || repo.archived !== false ||
      repo.permissions?.admin !== false || repo[e.method === 'merge' ? 'allow_merge_commit' : `allow_${e.method}_merge`] !== true) throw new MergeBlocked('merge_repository_not_qualified');
    const pr = await this.pr(e, input), head = sha(pr.head.sha), base = sha(pr.base.sha);
    await this.base(e, base);
    if (pr.state !== 'open' || pr.draft !== false || pr.merged !== false || pr.mergeable !== true || pr.mergeable_state !== 'clean') throw new MergeBlocked('merge_pull_request_not_ready');
    const ancestry = object(await this.request(e.credentialRef, 'GET', `${this.path(e)}/compare/${base}...${head}`));
    if (!['ahead','identical'].includes(ancestry.status) || ancestry.merge_base_commit?.sha !== base) throw new MergeBlocked('merge_base_not_current');
    const protection = await this.protections(e);
    const testMerge: string | null = pr.merge_commit_sha === null ? null : sha(pr.merge_commit_sha);
    if (testMerge) {
      const commit = object(await this.request(e.credentialRef, 'GET', `${this.path(e)}/git/commits/${testMerge}`));
      if (commit.sha !== testMerge || array(commit.parents).length !== 2 || commit.parents[0].sha !== base || commit.parents[1].sha !== head) throw new MergeBlocked('merge_test_context_stale');
    }
    const revisions = testMerge ? [head, testMerge] : [head];
    const checksBySha = new Map<string, any[]>(), statusesBySha = new Map<string, any[]>();
    for (const revision of revisions) {
      checksBySha.set(revision, await this.pages(e, `/commits/${revision}/check-runs?filter=latest`, 'check_runs'));
      statusesBySha.set(revision, await this.pages(e, `/commits/${revision}/statuses`));
    }
    const evidence = { schemaVersion: '1.0' as const, head, base, testMerge, protectionDigest: protection.digest, qualification,
      checks: [] as MergeEvidence['checks'][number][], runs: [] as MergeEvidence['runs'][number][] };
    const required = [...protection.checks];
    for (const check of e.checks) if (!required.some(item => item.context === check.context && item.appId === check.appId)) required.push(check);
    for (const requirement of required) {
      const expectedApp = requirement.appId ?? e.checks.find(check => check.context === requirement.context)?.appId;
      if (!expectedApp) throw new MergeBlocked('merge_check_provenance_unknown');
      // Legacy commit statuses do not expose an App ID. Never infer provenance
      // from a matching status name or creator login, even when it is green.
      if (revisions.some(revision => statusesBySha.get(revision)!.some(status => status.context === requirement.context))) throw new MergeBlocked('merge_status_provenance_unknown');
      // Test-merge evidence takes precedence when this context exists there.
      const revision = testMerge && checksBySha.get(testMerge)!.some(check => check.name === requirement.context) ? testMerge : head;
      const candidates = checksBySha.get(revision)!.filter(check => check.name === requirement.context && check.app?.id === expectedApp);
      if (candidates.length !== 1) throw new MergeBlocked('merge_required_check_missing');
      const check = candidates[0];
      if (check.head_sha !== revision || check.status !== 'completed' || check.conclusion !== 'success') throw new MergeBlocked('merge_required_check_not_successful');
      id(check.check_suite?.id);
      evidence.checks.push({ context: requirement.context, appId: expectedApp, id: id(check.id), sha: revision });
    }
    const runs = await this.pages(e, `/actions/runs?head_sha=${head}&event=pull_request`, 'workflow_runs');
    for (const workflow of e.workflows) {
      await this.workflowBlob(e, workflow, base); await this.workflowBlob(e, workflow, head);
      const candidates = runs.filter(run => run.workflow_id === workflow.id && run.path?.split('@')[0] === workflow.path)
        .sort((a, b) => id(b.id) - id(a.id) || id(b.run_attempt) - id(a.run_attempt));
      if (!candidates.length) throw new MergeBlocked('merge_required_workflow_missing');
      const run = object(await this.request(e.credentialRef, 'GET', `${this.path(e)}/actions/runs/${id(candidates[0].id)}/attempts/${id(candidates[0].run_attempt)}`));
      if (run.id !== candidates[0].id || run.run_attempt !== candidates[0].run_attempt || run.workflow_id !== workflow.id || run.path?.split('@')[0] !== workflow.path ||
        run.repository?.id !== e.repository.id || run.head_repository?.id !== e.repository.id || run.event !== 'pull_request' || run.head_sha !== head ||
        run.status !== 'completed' || run.conclusion !== 'success' || !array(run.pull_requests).some(pull => pull.number === input.pullRequest && pull.head?.sha === head && pull.base?.sha === base))
        throw new MergeBlocked('merge_workflow_context_stale');
      const suiteChecks = revisions.flatMap(revision => checksBySha.get(revision)!).filter(check => check.check_suite?.id === run.check_suite_id);
      if (!suiteChecks.length || suiteChecks.some(check => check.app?.id !== workflow.appId) ||
        !evidence.checks.some(required => suiteChecks.some(check => check.id === required.id))) throw new MergeBlocked('merge_workflow_checks_invalid');
      evidence.runs.push({ id: id(run.id), attempt: id(run.run_attempt), workflowId: workflow.id, blobSha: workflow.blobSha });
    }
    // Close the read window: changed revisions/protections or a newer run attempt
    // invalidate this evidence instead of silently substituting another tuple.
    const fresh = await this.pr(e, input), after = await this.protections(e);
    await this.base(e, base);
    if (fresh.base.sha !== base || fresh.merge_commit_sha !== testMerge || fresh.mergeable !== true || fresh.mergeable_state !== 'clean' ||
      fresh.state !== 'open' || fresh.draft !== false || fresh.merged !== false || after.digest !== protection.digest) throw new MergeBlocked('merge_context_changed');
    for (const run of evidence.runs) {
      const current = object(await this.request(e.credentialRef, 'GET', `${this.path(e)}/actions/runs/${run.id}`));
      if (current.id !== run.id || current.workflow_id !== run.workflowId || current.repository?.id !== e.repository.id ||
        current.head_sha !== head || current.event !== 'pull_request' || current.run_attempt !== run.attempt ||
        current.status !== 'completed' || current.conclusion !== 'success') throw new MergeBlocked('merge_workflow_context_stale');
    }
    return validated('merge-evidence', evidence as MergeEvidence);
  }
  async merge(e: MergeEnrollment, input: MergeInput): Promise<{ merged: boolean; sha: string | null }> {
    validated('merge-enrollment', e); validated('merge-input', input); this.identity(e);
    const result = object(await this.request(e.credentialRef, 'PUT', `${this.path(e)}/pulls/${input.pullRequest}/merge`, { sha: input.expectedHead, merge_method: e.method }));
    if (typeof result.merged !== 'boolean') throw new MergeBlocked('merge_response_invalid');
    return { merged: result.merged, sha: result.merged ? sha(result.sha) : null };
  }
  async observe(e: MergeEnrollment, input: MergeInput): Promise<MergeObservation> {
    validated('merge-enrollment', e); validated('merge-input', input);
    const pr = await this.pr(e, input);
    if (typeof pr.merged !== 'boolean') throw new MergeBlocked('merge_provider_data_invalid');
    return { repositoryId: pr.base.repo.node_id, pullRequest: pr.number, head: pr.head.sha, baseBranch: pr.base.ref,
      merged: pr.merged, mergeSha: pr.merged ? sha(pr.merge_commit_sha) : null, mergedBy: pr.merged_by?.id === undefined ? null : id(pr.merged_by.id) };
  }
  async qualify(e: MergeEnrollment, mergeSha: string, runId: number): Promise<MergeQualification> {
    validated('merge-enrollment', e); this.identity(e); sha(mergeSha); id(runId);
    if (mergeSha !== e.qualification.mergeSha || runId !== e.qualification.runId) throw new MergeBlocked('merge_qualification_identity_mismatch');
    const proof = object(await this.request(e.credentialRef, 'GET', `${this.path(e)}/pulls/${e.qualification.pullRequest}`));
    const run = object(await this.request(e.credentialRef, 'GET', `${this.path(e)}/actions/runs/${runId}`));
    const suite = object(await this.request(e.credentialRef, 'GET', `${this.path(e)}/check-suites/${id(run.check_suite_id)}`));
    await this.workflowBlob(e, e.downstream, mergeSha);
    const qualified = proof.number === e.qualification.pullRequest && proof.merged === true && proof.merge_commit_sha === mergeSha &&
      proof.merged_by?.id === e.actorId && proof.base?.ref === e.baseBranch && proof.base?.repo?.id === e.repository.id &&
      run.id === runId && run.repository?.id === e.repository.id && run.head_repository?.id === e.repository.id && run.event === 'push' &&
      run.head_sha === mergeSha && run.head_branch === e.baseBranch && run.actor?.id === e.actorId && run.triggering_actor?.id === e.actorId &&
      run.workflow_id === e.downstream.id && run.path?.split('@')[0] === e.downstream.path && run.status === 'completed' && run.conclusion === 'success' &&
      suite.id === run.check_suite_id && suite.app?.id === e.downstream.appId && suite.head_sha === mergeSha && suite.status === 'completed' && suite.conclusion === 'success';
    return validated('merge-qualification', { schemaVersion: '1.0', repositoryId: e.repository.id, appId: e.appId, installationId: e.installationId,
      actorId: e.actorId, credentialRef: e.credentialRef, mergeSha, workflowId: e.downstream.id, workflowBlobSha: e.downstream.blobSha,
      runId, runAttempt: id(run.run_attempt), event: 'push', qualified, blocker: qualified ? null : 'merge_downstream_not_qualified' });
  }
}
