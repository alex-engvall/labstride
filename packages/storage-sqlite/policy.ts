import { AutomationStore } from './automation.ts';
import { controlContext } from './scheduling.ts';
import { validated } from './validation.ts';
import { canonical, digest } from '../configuration/json.ts';
import { LifecycleError } from '../core/lifecycle.ts';
import { isLocalPolicyAuthority } from '../core/policy.ts';
import type { Policy, PolicyChange, ActorEvidence, Decision, LocalPolicyAuthority } from '../core/policy.ts';
import type { AuditContext, RecordOf } from '../core/lifecycle.ts';
import type { StoreDependencies } from './store.ts';
import type { StartPlan } from '../core/execution.ts';
import type { RuleObservation } from '../configuration/rules.ts';
import type { ConfigurationSnapshot } from '../configuration/snapshot.ts';

type Restriction = Extract<PolicyChange['change'], {kind: 'restrict'}>;
export interface PolicyReceipt { schemaVersion: '1.0'; revision: number; policyRevision: number }
export function authorizationObservationDigest(observation: RuleObservation): string {
  return digest({ ...observation, event: { ...observation.event, observedAt: observation.event.occurredAt } });
}
export class PolicyStore extends AutomationStore {
  #authority: LocalPolicyAuthority | undefined;
  #verifier: StoreDependencies['actorVerifier'];
  #admission: { digest: string; actorId: string; revision: number } | undefined;
  constructor(dataDir: string, dependencies: StoreDependencies = {}) {
    super(dataDir, dependencies);
    this.#authority = dependencies.policyAuthority;
    this.#verifier = dependencies.actorVerifier;
  }
  protected assertOperator(authority: LocalPolicyAuthority | undefined): void {
    if (!isLocalPolicyAuthority(authority) || authority !== this.#authority) throw new LifecycleError('effect_blocked');
  }
  protected override assertControlAuthority(runId: string, authority?: LocalPolicyAuthority): void {
    const request = this.get('request', this.get('run', runId).requestId);
    if (this.runConfiguration(runId) || this.policyStatus(request.installationId) ||
      this.db.prepare('SELECT 1 FROM active_configurations WHERE installation_id=?').get(request.installationId)) this.assertOperator(authority);
  }
  policyStatus(installationId: string): PolicyReceipt | null {
    const state = this.db.prepare('SELECT revision,policy_revision FROM policy_state WHERE installation_id=?').get(installationId);
    return state ? { schemaVersion: '1.0', revision: Number(state.revision), policyRevision: Number(state.policy_revision) } : null;
  }
  policyHistory(installationId: string): { request: PolicyChange; context: AuditContext; receipt: PolicyReceipt }[] {
    return this.db.prepare('SELECT payload,receipt FROM policy_changes WHERE installation_id=? ORDER BY rowid').all(installationId)
      .map(row => {
        const payload = JSON.parse(String(row.payload)) as { request: PolicyChange; context: AuditContext };
        return { request: validated('policy-change', payload.request), context: controlContext(payload.context),
          receipt: JSON.parse(String(row.receipt)) as PolicyReceipt };
      });
  }
  policyRevision(installationId: string, revision: number): Policy {
    const row = this.db.prepare('SELECT payload,digest FROM policy_revisions WHERE installation_id=? AND revision=?').get(installationId, revision);
    if (!row) throw new LifecycleError('effect_blocked');
    const policy = validated<Policy>('authorization-policy', JSON.parse(String(row.payload)));
    if (policy.installationId !== installationId || digest(policy) !== row.digest) throw new LifecycleError('effect_blocked');
    return policy;
  }
  applyPolicyChange(input: PolicyChange, authority: LocalPolicyAuthority, audit: AuditContext): PolicyReceipt {
    this.assertOperator(authority);
    const request = validated('policy-change', input), context = controlContext(audit);
    const payload = canonical({ request, context });
    return this.transaction(() => {
      const previous = this.db.prepare('SELECT payload,receipt FROM policy_changes WHERE id=?').get(request.id);
      if (previous) {
        if (previous.payload !== payload) throw new LifecycleError('identity_conflict');
        return JSON.parse(String(previous.receipt)) as PolicyReceipt;
      }
      this.get('installation', request.installationId);
      const state = this.policyStatus(request.installationId);
      if ((state?.revision ?? 0) !== request.expectedRevision) throw new LifecycleError('revision_conflict');
      const revision = request.expectedRevision + 1, change = request.change;
      let policyRevision = state?.policyRevision;
      if (change.kind === 'publish') {
        if (change.policy.installationId !== request.installationId) throw new LifecycleError('identity_conflict');
        if (new Set(change.policy.repositories.map(repo => repo.id)).size !== change.policy.repositories.length ||
          new Set(change.policy.repositories.map(repo => repo.name)).size !== change.policy.repositories.length ||
          change.policy.grants.some(grant => !change.policy.repositories.some(repo => repo.id === grant.repositoryId))) throw new LifecycleError('invalid_payload');
        this.db.prepare('INSERT INTO policy_revisions VALUES (?,?,?,?)').run(request.installationId, revision, canonical(change.policy), digest(change.policy));
        policyRevision = revision;
      } else {
        if (!state) throw new LifecycleError('effect_blocked');
        if (change.kind === 'bind_run') {
          const run = this.get('run', change.runId), requestRecord = this.get('request', run.requestId);
          const binding = this.db.prepare('SELECT actor_id FROM run_authorizations WHERE run_id=?').get(run.id);
          if (!binding || !this.runConfiguration(run.id) || requestRecord.installationId !== request.installationId ||
            ['completed','failed','cancelled'].includes(run.state)) throw new LifecycleError('effect_blocked');
          this.policyRevision(request.installationId, change.policyRevision);
          this.db.prepare('UPDATE run_authorizations SET policy_revision=? WHERE run_id=?').run(change.policyRevision, run.id);
        } else {
          if (change.runId !== null) {
            const run = this.get('run', change.runId);
            if (this.get('request', run.requestId).installationId !== request.installationId) throw new LifecycleError('identity_conflict');
          }
          this.db.prepare(`INSERT INTO policy_restrictions VALUES (?,?,?) ON CONFLICT(installation_id,scope)
            DO UPDATE SET payload=excluded.payload`).run(request.installationId, change.runId === null ? 'installation' : `run:${change.runId}`, canonical(change));
        }
      }
      const receipt: PolicyReceipt = { schemaVersion: '1.0', revision, policyRevision: policyRevision! };
      this.db.prepare(`INSERT INTO policy_state VALUES (?,?,?) ON CONFLICT(installation_id)
        DO UPDATE SET revision=excluded.revision,policy_revision=excluded.policy_revision`).run(request.installationId, revision, policyRevision!);
      this.db.prepare('INSERT INTO policy_changes VALUES (?,?,?,?)').run(request.id, request.installationId, payload, canonical(receipt));
      this.db.prepare('INSERT INTO execution_log(operation_id,at,kind,payload) VALUES (NULL,?,?,?)')
        .run(this.clock.now(), 'policy_change', canonical({ request, context, receipt }));
      return receipt;
    });
  }
  private restrictions(installationId: string, runId?: string): Restriction[] {
    return this.db.prepare('SELECT payload FROM policy_restrictions WHERE installation_id=? AND scope IN (?,?)')
      .all(installationId, 'installation', runId ? `run:${runId}` : 'installation')
      .map(row => {
        const change = JSON.parse(String(row.payload)) as Restriction;
        const wrapped: PolicyChange = { schemaVersion: '1.0', id: 'check', installationId, expectedRevision: 0, change };
        validated('policy-change', wrapped);
        return change;
      });
  }
  private decide(installationId: string, revision: number | null, actorId: string | null,
    source: { repositoryId: string; repository: string } | undefined, operation?: RecordOf<'operation'>['request'],
    runId?: string, effect: 'execute' | 'cancel' = 'execute'): Decision {
    const result = (code: Decision['code']): Decision => ({ schemaVersion: '1.0', allowed: code === 'allowed', code, policyRevision: revision, actorId });
    if (revision === null) return result('policy_missing');
    const policy = this.policyRevision(installationId, revision);
    if (actorId === null || !policy.actorIds.includes(actorId)) return result('actor_denied');
    if (!source || !policy.repositories.some(repo => repo.id === source.repositoryId && repo.name === source.repository)) return result('repository_denied');
    for (const restriction of this.restrictions(installationId, runId)) {
      if (restriction.paused) return result('policy_paused');
      if (restriction.actorIds.includes(actorId)) return result('actor_denied');
      if (restriction.repositoryIds.includes(source.repositoryId)) return result('repository_denied');
      if (operation && (restriction.targetIds.includes(operation.targetId) || restriction.actions.some(action => action.id === operation.actionId && action.version === operation.actionVersion))) return result('operation_denied');
    }
    if (operation && !policy.grants.some(grant => grant.repositoryId === source.repositoryId && grant.targetId === operation.targetId &&
      grant.actionId === operation.actionId && grant.actionVersion === operation.actionVersion && grant.effects.includes(effect))) return result('operation_denied');
    return result('allowed');
  }
  protected authorizeObservation(snapshot: ConfigurationSnapshot, observation: RuleObservation, source: {repositoryId: string; repository: string} | undefined): Decision {
    const installationId = snapshot.configuration.installationId;
    const revision = this.policyStatus(installationId)?.policyRevision ?? null;
    const denied: Decision = { schemaVersion: '1.0', allowed: false, code: 'actor_unverified', policyRevision: revision, actorId: null };
    let evidence: ActorEvidence | null;
    try { evidence = this.#verifier?.(structuredClone(observation)) ?? null;
      if (evidence) evidence = validated('actor-evidence', evidence);
    } catch { return denied; }
    if (!evidence || evidence.installationId !== installationId || evidence.configDigest !== snapshot.digest ||
      evidence.externalId !== observation.event.externalId || evidence.subjectId !== observation.event.subjectId ||
      evidence.providerId !== observation.event.provider || evidence.actorId !== observation.event.actorId ||
      evidence.generation !== observation.generation || evidence.observationDigest !== authorizationObservationDigest(observation) ||
      evidence.repositoryId !== source?.repositoryId || evidence.repository !== source?.repository || observation.event.origin !== 'human') return denied;
    if (!snapshot.configuration.github.actorIds.includes(evidence.actorId)) return { ...denied, code: 'actor_denied', actorId: evidence.actorId };
    return this.decide(installationId, revision, evidence.actorId, source);
  }
  protected authorizePlan(plan: StartPlan, decision: Decision): Decision {
    if (!decision.allowed) return decision;
    if (plan.run.repositoryId !== plan.operation.request.source.repositoryId || plan.workspace.targetId !== plan.operation.request.targetId) throw new LifecycleError('identity_conflict');
    return this.decide(plan.request.installationId, decision.policyRevision, decision.actorId, plan.operation.request.source, plan.operation.request);
  }
  protected withPolicyAdmission<T>(plan: StartPlan, decision: Decision, work: () => T): T {
    if (!decision.allowed || decision.actorId === null || decision.policyRevision === null || this.#admission) throw new LifecycleError('effect_blocked');
    this.#admission = { digest: digest(plan), actorId: decision.actorId, revision: decision.policyRevision };
    try { return work(); } finally { this.#admission = undefined; }
  }
  protected bindStartPolicy(plan: StartPlan, audit: AuditContext): void {
    if (!this.policyStatus(plan.request.installationId) && !this.runConfiguration(plan.run.id)) return; // legacy trusted fixture installations only
    const admission = this.#admission;
    if (!admission || admission.digest !== digest(plan) || admission.actorId !== audit.actorId) throw new LifecycleError('effect_blocked');
    const decision = this.decide(plan.request.installationId, admission.revision, admission.actorId, plan.operation.request.source, plan.operation.request);
    if (!decision.allowed) throw new LifecycleError('effect_blocked');
    this.db.prepare('INSERT INTO run_authorizations VALUES (?,?,?,?)').run(plan.run.id, plan.request.installationId, admission.revision, admission.actorId);
  }
  protected assertPolicyOperation(runId: string, operation: RecordOf<'operation'>['request'], effect: 'execute' | 'cancel' = 'execute'): void {
    const run = this.get('run', runId), request = this.get('request', run.requestId);
    const binding = this.db.prepare('SELECT * FROM run_authorizations WHERE run_id=?').get(runId);
    if (!binding && !this.runConfiguration(runId) && !this.policyStatus(request.installationId) &&
      !this.db.prepare('SELECT 1 FROM active_configurations WHERE installation_id=?').get(request.installationId)) return;
    if (!binding || binding.installation_id !== request.installationId || run.repositoryId !== operation.source.repositoryId ||
      !this.decide(request.installationId, Number(binding.policy_revision), String(binding.actor_id), operation.source, operation, runId, effect).allowed) throw new LifecycleError('effect_blocked');
  }
  operationAuthorization(operationId: string, effect: 'execute' | 'cancel' = 'execute'): Decision {
    const operation = this.get('operation', operationId), run = this.get('run', operation.runId), request = this.get('request', run.requestId);
    const binding = this.db.prepare('SELECT * FROM run_authorizations WHERE run_id=?').get(run.id);
    return this.decide(request.installationId, binding ? Number(binding.policy_revision) : null,
      binding ? String(binding.actor_id) : null, operation.request.source, operation.request, run.id, effect);
  }
  protected policyProjectionAllowed(runId: string): boolean {
    const request = this.get('request', this.get('run', runId).requestId);
    if (!this.runConfiguration(runId) && !this.policyStatus(request.installationId)) return true;
    if (!this.db.prepare('SELECT 1 FROM run_authorizations WHERE run_id=?').get(runId)) return false;
    // Progress uses the coordinator's pinned projection authority. A targeted
    // action revocation may still be reported; emergency pause stops writes.
    return !this.restrictions(request.installationId, runId).some(restriction => restriction.paused);
  }
  authorizationDecision(inboxId: string): Decision | null {
    const row = this.db.prepare('SELECT payload FROM authorization_decisions WHERE inbox_id=?').get(inboxId);
    return row ? validated<Decision>('authorization-decision', JSON.parse(String(row.payload))) : null;
  }
  protected recordAuthorization(inboxId: string, decision: Decision): void {
    this.db.prepare('INSERT INTO authorization_decisions VALUES (?,?)').run(inboxId, canonical(validated('authorization-decision', decision)));
  }
}
