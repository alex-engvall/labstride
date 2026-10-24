import { canonicalPath } from './paths.ts';
import { SqliteStore } from './store.ts';
import { validated } from './validation.ts';
import { LifecycleError } from '../core/lifecycle.ts';
import type { AuditContext, RecordOf } from '../core/lifecycle.ts';
import type { SchedulingPolicy } from '../../contracts/generated/scheduling-policy.ts';

export function controlContext(context: AuditContext): AuditContext {
  if (!context || typeof context !== 'object' || Object.keys(context).some(k => !['actorId','reason','evidenceRefs'].includes(k)) ||
    typeof context.actorId !== 'string' || !context.actorId || context.actorId.length > 1024 ||
    typeof context.reason !== 'string' || !context.reason || context.reason.length > 1024 ||
    !Array.isArray(context.evidenceRefs) || !context.evidenceRefs.length || context.evidenceRefs.length > 128 ||
    context.evidenceRefs.some(ref => typeof ref !== 'string' || !ref || ref.length > 4096)) throw new LifecycleError('recovery_required');
  return structuredClone(context);
}
export class SchedulingStore extends SqliteStore {
  schedulingPolicy(): SchedulingPolicy {
    return validated('scheduling-policy', JSON.parse(String(this.db.prepare('SELECT payload FROM scheduling_policy WHERE id=1').get()!.payload)));
  }
  configureScheduling(input: Omit<SchedulingPolicy, 'development' | 'ciReview'> & Partial<Pick<SchedulingPolicy, 'development' | 'ciReview'>>, context: AuditContext): void {
    if (!input || typeof input !== 'object') throw new LifecycleError('invalid_payload');
    const policy = validated<SchedulingPolicy>('scheduling-policy', { ...input, development: input.development === undefined ? input.activeRuns : input.development, ciReview: input.ciReview === undefined ? input.activeRuns : input.ciReview });
    this.transaction(() => {
      const safe = controlContext(context);
      this.db.prepare('INSERT INTO execution_log(operation_id,at,kind,payload) VALUES (NULL,?,?,?)')
        .run(this.clock.now(), 'scheduling_policy', JSON.stringify({ policy, context: safe }));
      this.db.prepare('UPDATE scheduling_policy SET payload=? WHERE id=1').run(JSON.stringify(policy));
    });
  }
  protected unresolved(runId: string, requireFulfillment = true): boolean {
    return this.db.prepare("SELECT id,state FROM operations WHERE run_id=? AND state NOT IN ('succeeded','failed','cancelled')").all(runId)
      .some(op => op.state !== 'superseded' || requireFulfillment && !this.successorSatisfied(String(op.id))) ||
      !!this.db.prepare("SELECT 1 FROM deliveries d JOIN operations o ON o.id=d.operation_id WHERE o.run_id=? AND d.state='conflict'").get(runId);
  }
  protected liveRun(run: RecordOf<'run'>): boolean {
    return !['completed','failed','cancelled'].includes(run.state) || this.unresolved(run.id, run.state === 'completed');
  }
  protected issuePeers(run: RecordOf<'run'>, request = this.get('request', run.requestId)): RecordOf<'run'>[] {
    return this.db.prepare(`SELECT r.id FROM runs r JOIN requests q ON q.id=r.request_id
      WHERE q.provider_id=? AND q.issue_id=? AND json_extract(r.payload,'$.repositoryId')=? AND r.id!=?`)
      .all(request.providerId, request.issueId, run.repositoryId, run.id)
      .map(row => this.get('run', String(row.id))).filter(other => this.liveRun(other));
  }
  protected assertWorkspaceExclusive(workspaceId: string): void {
    const workspace = this.get('workspace', workspaceId), run = this.get('run', workspace.runId);
    for (const row of this.db.prepare("SELECT id FROM workspaces WHERE id!=? AND state!='deleted'").all(workspace.id)) {
      const other = this.get('workspace', String(row.id));
      if ((other.targetId === workspace.targetId && other.locator === workspace.locator) ||
        (other.localPath !== null && workspace.localPath !== null && canonicalPath(other.localPath) === canonicalPath(workspace.localPath)) ||
        (other.branch === workspace.branch && this.get('run', other.runId).repositoryId === run.repositoryId))
        throw new LifecycleError('identity_conflict');
    }
  }
  protected reserve(operationId: string): void {
    const op = this.get('operation', operationId), run = this.get('run', op.runId);
    this.assertWorkspaceExclusive(op.workspaceId);
    if (this.issuePeers(run).length) throw new LifecycleError('issue_busy');
    const policy = this.schedulingPolicy();
    const admission = this.db.prepare('SELECT admitted_at FROM run_admissions WHERE run_id=?').get(run.id);
    if (!admission) throw new LifecycleError('effect_blocked'); // legacy unbound records acquire no execution permission
    let occupied = this.db.prepare('SELECT run_id FROM run_admissions WHERE admitted_at IS NOT NULL').all()
      .filter(row => this.liveRun(this.get('run', String(row.run_id)))).length;
    for (const queued of this.db.prepare(`SELECT a.run_id FROM run_admissions a JOIN runs r ON r.id=a.run_id
      WHERE a.admitted_at IS NULL ORDER BY r.rowid`).all()) {
      if (occupied >= policy.activeRuns) break;
      const candidate = this.get('run', String(queued.run_id));
      if (!this.liveRun(candidate) || this.issuePeers(candidate).length) continue;
      this.db.prepare('UPDATE run_admissions SET admitted_at=? WHERE run_id=?').run(this.clock.now(), candidate.id);
      occupied++;
    }
    if (this.db.prepare('SELECT admitted_at FROM run_admissions WHERE run_id=?').get(run.id)!.admitted_at === null)
      throw new LifecycleError('capacity_wait');
    const own = this.db.prepare('SELECT 1 FROM claims WHERE operation_id=? AND active=1').get(op.id);
    if (own) return;
    if (this.db.prepare('SELECT 1 FROM claims c JOIN operations o ON o.id=c.operation_id WHERE o.run_id=? AND c.active=1').get(run.id))
      throw new LifecycleError('resource_busy');
    const entry = this.db.prepare('SELECT capacity_class FROM operation_scheduling WHERE operation_id=?').get(op.id);
    if (!entry) throw new LifecycleError('effect_blocked');
    const capacityClass = entry.capacity_class as 'development' | 'ciReview';
    const count = this.db.prepare(`SELECT count(*) AS n FROM operation_scheduling s WHERE s.capacity_class=? AND (EXISTS
      (SELECT 1 FROM claims c WHERE c.operation_id=s.operation_id AND c.active=1) OR EXISTS
      (SELECT 1 FROM deliveries d WHERE d.operation_id=s.operation_id AND d.state='conflict'))`).get(capacityClass)!.n as number;
    if (count >= policy[capacityClass]) throw new LifecycleError('capacity_wait');
  }
  schedulingStatus(runId: string) {
    const run = this.get('run', runId);
    const admission = this.db.prepare('SELECT admitted_at FROM run_admissions WHERE run_id=?').get(runId);
    return { schemaVersion: '1.0' as const, runId, admittedAt: admission?.admitted_at as string | null ?? null,
      reserved: !!admission?.admitted_at && this.liveRun(run), issueConflict: this.issuePeers(run).length > 0,
      policy: this.schedulingPolicy(), usage: {
        activeRuns: this.db.prepare('SELECT run_id FROM run_admissions WHERE admitted_at IS NOT NULL').all().filter(row => this.liveRun(this.get('run', String(row.run_id)))).length,
        development: Number(this.db.prepare("SELECT count(*) AS n FROM operation_scheduling s WHERE s.capacity_class='development' AND (EXISTS (SELECT 1 FROM claims c WHERE c.operation_id=s.operation_id AND c.active=1) OR EXISTS (SELECT 1 FROM deliveries d WHERE d.operation_id=s.operation_id AND d.state='conflict'))").get()!.n),
        ciReview: Number(this.db.prepare("SELECT count(*) AS n FROM operation_scheduling s WHERE s.capacity_class='ciReview' AND (EXISTS (SELECT 1 FROM claims c WHERE c.operation_id=s.operation_id AND c.active=1) OR EXISTS (SELECT 1 FROM deliveries d WHERE d.operation_id=s.operation_id AND d.state='conflict'))").get()!.n),
      }, activeOperations: this.db.prepare('SELECT c.operation_id FROM claims c JOIN operations o ON o.id=c.operation_id WHERE o.run_id=? AND c.active=1').all(runId).map(row => String(row.operation_id)) };
  }
}
