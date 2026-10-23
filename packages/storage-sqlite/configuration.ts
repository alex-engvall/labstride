import { SessionStore } from './sessions.ts';
import { validated } from './validation.ts';
import { canonical } from '../configuration/json.ts';
import { compiledSnapshot } from '../configuration/compiler.ts';
import type { CompiledConfiguration } from '../configuration/compiler.ts';
import { evaluateRules } from '../configuration/rules.ts';
import type { RuleObservation, RuleEvaluation } from '../configuration/rules.ts';
import type { BindingContext, BoundStep } from '../configuration/bindings.ts';
import type { AuditContext } from '../core/lifecycle.ts';
import { LifecycleError } from '../core/lifecycle.ts';
import type { StartPlan, InboxInput } from '../core/execution.ts';
import { recoveryContext, requestDigest } from './execution.ts';
import type { Decision, LocalPolicyAuthority } from '../core/policy.ts';

export interface ConfigurationReceipt {
  schemaVersion: '1.0'; inboxId: string; configDigest: string; evaluation: RuleEvaluation; runId: string | null; authorization: Decision | null;
}
export class ConfigurationStore extends SessionStore {
  activateConfiguration(compiled: CompiledConfiguration, expectedRevision: number | null, authorization: AuditContext, authority?: LocalPolicyAuthority): string {
    this.assertOperator(authority);
    const snapshot = compiledSnapshot(compiled), context = recoveryContext(authorization);
    return this.transaction(() => {
      const id = snapshot.configuration.installationId;
      const existing = this.db.prepare('SELECT id FROM installations WHERE id=?').get(id);
      const old = existing ? this.get('installation', id) : null;
      if ((old?.revision ?? null) !== expectedRevision) {
        // Lost activation acknowledgements can be read back without advancing twice.
        if (old?.configRevision === snapshot.digest && old.revision === (expectedRevision ?? 0) + 1 &&
          this.db.prepare('SELECT digest FROM active_configurations WHERE installation_id=?').get(id)?.digest === snapshot.digest) return snapshot.digest;
        throw new LifecycleError('revision_conflict');
      }
      this.write([{ expectedRevision, record: { schemaVersion: '1.0', kind: 'installation', id,
        revision: (old?.revision ?? 0) + 1, createdAt: old?.createdAt ?? this.clock.now(), updatedAt: this.clock.now(), configRevision: snapshot.digest } }], context);
      const previous = this.db.prepare('SELECT payload FROM configuration_snapshots WHERE digest=?').get(snapshot.digest);
      if (previous && previous.payload !== canonical(snapshot)) throw new LifecycleError('identity_conflict');
      this.db.prepare('INSERT OR IGNORE INTO configuration_snapshots VALUES (?,?,?)').run(snapshot.digest, id, canonical(snapshot));
      this.db.prepare(`INSERT INTO active_configurations VALUES (?,?) ON CONFLICT(installation_id) DO UPDATE SET digest=excluded.digest`).run(id, snapshot.digest);
      const limits = snapshot.configuration.limits;
      this.configureScheduling({ schemaVersion: '1.0', activeRuns: limits.activeRuns, development: limits.development ?? limits.activeRuns,
        ciReview: limits.ciReview ?? limits.activeRuns, maxRepairs: limits.maxRepairs ?? 3, unattendedMs: limits.unattendedMs ?? 86400000 }, context);
      this.log(null, 'configuration_activated', { installationId: id, configDigest: snapshot.digest, context });
      return snapshot.digest;
    });
  }
  configurationReceipt(inboxId: string): ConfigurationReceipt {
    const row = this.db.prepare('SELECT * FROM rule_evaluations WHERE inbox_id=?').get(inboxId);
    if (!row) throw new LifecycleError('not_found');
    return { schemaVersion: '1.0', inboxId, configDigest: String(row.config_digest),
      evaluation: validated<RuleEvaluation>('rule-evaluation', JSON.parse(String(row.payload))), runId: row.run_id as string | null,
      authorization: this.authorizationDecision(inboxId) };
  }
  // The enrolled verifier authenticates attribution. AuditContext is only audit;
  // neither it nor the observation can provide policy authority.
  requestConfiguredStart(compiled: CompiledConfiguration, input: RuleObservation, contextInput: BindingContext,
    buildPlan: (steps: BoundStep[], observation: RuleObservation) => StartPlan, authorization: AuditContext): ConfigurationReceipt {
    const snapshot = compiledSnapshot(compiled), observation = validated('rule-observation', input);
    const context = recoveryContext(authorization);
    if (observation.event.kind !== 'field.changed' || observation.event.installationId !== snapshot.configuration.installationId ||
      context.actorId !== observation.event.actorId) throw new LifecycleError('identity_conflict');
    const inbox: InboxInput = validated('execution-inbox', { schemaVersion: '1.0', stream: 'configured-requests', checkpoint: null,
      event: { ...observation.event, kind: 'start.requested', facts: { generation: observation.generation,
        configurationObservation: { ...observation, event: { ...observation.event, observedAt: observation.event.occurredAt } } } } });
    return this.transaction(() => {
      const received = this.receiveInside(inbox);
      const old = this.db.prepare('SELECT 1 FROM rule_evaluations WHERE inbox_id=?').get(received.id);
      if (old) return this.configurationReceipt(received.id); // No rebind or effects on lost reply/configuration changes.
      const active = this.db.prepare('SELECT digest FROM active_configurations WHERE installation_id=?').get(snapshot.configuration.installationId);
      if (active?.digest !== snapshot.digest || canonical(this.configurationSnapshot(snapshot.digest)) !== canonical(snapshot))
        throw new LifecycleError('effect_blocked');
      let evaluation = evaluateRules(snapshot, observation);
      let decision = this.authorizeObservation(snapshot, observation, contextInput.source);
      let runId: string | null = null;
      if (evaluation.outcome === 'matched' && !decision.allowed)
        evaluation = { schemaVersion: '1.0', outcome: 'blocked', code: 'authorization_denied', ruleIds: evaluation.ruleIds, workflow: null };
      if (evaluation.outcome === 'matched') {
        let bound: BoundStep[] | undefined;
        try {
          const firstStep = snapshot.configuration.workflows[evaluation.workflow!][0];
          bound = [compiled.bindStep(evaluation.workflow!, firstStep.id, observation.current, contextInput)];
        }
        catch { evaluation = { schemaVersion: '1.0', outcome: 'blocked', code: 'invalid_value', ruleIds: evaluation.ruleIds, workflow: null }; }
        if (bound) {
          const plan = buildPlan(structuredClone(bound), structuredClone(observation));
          const first = bound[0], operation = plan.operation.request;
          if (operation.actionId !== first.actionId || operation.actionVersion !== first.actionVersion || canonical(operation.inputs) !== canonical(first.inputs) ||
            operation.configDigest !== snapshot.digest || plan.run.configRevision !== snapshot.digest ||
            (Object.hasOwn(first.inputs, 'target') && operation.targetId !== first.inputs.target) ||
            (contextInput.source && canonical(operation.source) !== canonical(contextInput.source)) ||
            (contextInput.workspaceId && plan.workspace.id !== contextInput.workspaceId) ||
            operation.requestDigest !== requestDigest(operation)) throw new LifecycleError('identity_conflict');
          decision = this.authorizePlan(plan, decision);
          if (!decision.allowed) evaluation = { schemaVersion: '1.0', outcome: 'blocked', code: 'authorization_denied', ruleIds: evaluation.ruleIds, workflow: null };
          else {
            const admittedPlan = { ...plan, configurationSnapshot: snapshot };
            runId = this.withPolicyAdmission(admittedPlan, decision, () => this.scheduleStart(received.id, admittedPlan, context));
            if (this.get('run', runId).configRevision !== snapshot.digest) throw new LifecycleError('identity_conflict');
          }
        }
      }
      if (!runId) this.db.prepare('UPDATE inbox SET processed=1 WHERE id=?').run(received.id);
      this.recordAuthorization(received.id, decision);
      this.db.prepare('INSERT INTO rule_evaluations VALUES (?,?,?,?)').run(received.id, snapshot.digest, canonical(evaluation), runId);
      this.log(null, 'rule_evaluation', { inboxId: received.id, configDigest: snapshot.digest, evaluation, runId });
      return this.configurationReceipt(received.id);
    });
  }
}
