import { createHash } from 'node:crypto';
import { SqliteStore } from './store.ts';
import { validated } from './validation.ts';
import { LifecycleError } from '../core/lifecycle.ts';
import type { AuditContext, RecordOf } from '../core/lifecycle.ts';
import type { InboxEntry, InboxInput, InboxStore, StartPlan, Claim, BoundResult, Delivery, RetryPolicy } from '../core/execution.ts';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value);
}
export const digest = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex');
export function requestDigest(request: StartPlan['operation']['request']): string {
  const { requestDigest: _digest, ...contents } = request; return digest(contents);
}
export function recoveryContext(context: AuditContext): AuditContext {
  if (!context || typeof context !== 'object' || Object.keys(context).some(k => !['actorId','reason','evidenceRefs'].includes(k)) ||
    typeof context.actorId !== 'string' || !context.actorId || context.actorId.length > 1024 ||
    typeof context.reason !== 'string' || !context.reason || context.reason.length > 1024 ||
    !Array.isArray(context.evidenceRefs) || !context.evidenceRefs.length || context.evidenceRefs.length > 128 ||
    context.evidenceRefs.some(ref => typeof ref !== 'string' || !ref || ref.length > 4096)) throw new LifecycleError('recovery_required');
  return structuredClone(context);
}
function bounded(value: string): void {
  if (typeof value !== 'string' || !value || value.length > 1024) throw new LifecycleError('invalid_payload');
}

export class ExecutionStore extends SqliteStore implements InboxStore {
  receive(input: InboxInput): { id: string; duplicate: boolean } {
    const safe = validated('execution-inbox', input);
    return this.transaction(() => this.receiveInside(safe));
  }

  protected receiveInside(input: InboxInput): { id: string; duplicate: boolean } {
    const { event, stream, checkpoint } = input;
    const identity = [event.installationId, event.provider, stream, event.externalId];
    const existing = this.db.prepare('SELECT id,digest,payload FROM inbox WHERE installation_id=? AND provider_id=? AND stream=? AND external_id=?').get(...identity);
    // Acquisition time is local metadata. Preserve the first timestamp and v3 digest on replay.
    const hash = digest({ ...event, observedAt: existing ? JSON.parse(String(existing.payload)).event.observedAt : event.observedAt });
    if (existing && existing.digest !== hash) throw new LifecycleError('identity_conflict');
    const id = existing ? String(existing.id) : this.identities.next();
    if (!existing) this.db.prepare('INSERT INTO inbox(id,installation_id,provider_id,stream,external_id,digest,payload) VALUES (?,?,?,?,?,?,?)')
      .run(id, ...identity, hash, JSON.stringify(input));
    if (checkpoint) {
      const key = identity.slice(0, 3);
      const previous = this.db.prepare('SELECT revision,cursor FROM checkpoints WHERE installation_id=? AND provider_id=? AND stream=?').get(...key);
      // A lost acknowledgement may replay the already committed checkpoint exactly.
      if (!(existing && previous?.revision === checkpoint.expectedRevision + 1 && previous.cursor === checkpoint.cursor)) {
        if ((previous?.revision ?? 0) !== checkpoint.expectedRevision) throw new LifecycleError('revision_conflict');
        this.db.prepare(`INSERT INTO checkpoints VALUES (?,?,?,?,?) ON CONFLICT(installation_id,provider_id,stream)
          DO UPDATE SET revision=excluded.revision,cursor=excluded.cursor`).run(...key, checkpoint.expectedRevision + 1, checkpoint.cursor);
      }
    }
    return { id, duplicate: !!existing };
  }

  event(id: string): InboxEntry {
    const row = this.db.prepare('SELECT * FROM inbox WHERE id=?').get(id);
    if (!row) throw new LifecycleError('not_found');
    return { id, input: validated('execution-inbox', JSON.parse(String(row.payload))), processed: row.processed === 1, runId: row.run_id as string | null };
  }
  pendingEvents(): InboxEntry[] {
    return this.db.prepare('SELECT id FROM inbox WHERE processed=0 ORDER BY rowid LIMIT 64').all().map(row => this.event(String(row.id)));
  }
  checkpoint(installation: string, provider: string, stream: string): { revision: number; cursor: string } | null {
    const row = this.db.prepare('SELECT revision,cursor FROM checkpoints WHERE installation_id=? AND provider_id=? AND stream=?').get(installation, provider, stream);
    return row ? { revision: Number(row.revision), cursor: String(row.cursor) } : null;
  }

  scheduleStart(id: string, input: StartPlan, authorization: AuditContext): string {
    // The plan comes from authorized policy, never by spreading event.facts into a plan.
    bounded(input.resourceKey);
    const plan = { ...input, request: validated('lifecycle-record', input.request), run: validated('lifecycle-record', input.run),
      workspace: validated('lifecycle-record', input.workspace), operation: validated('lifecycle-record', input.operation),
      outbox: validated('lifecycle-record', input.outbox), projections: input.projections.map(p => validated('lifecycle-record', p)) };
    if (plan.request.kind !== 'request' || plan.run.kind !== 'run' || plan.workspace.kind !== 'workspace' ||
      plan.operation.kind !== 'operation' || plan.outbox.kind !== 'outbox' || plan.projections.some(p => p.kind !== 'projection'))
      throw new LifecycleError('invalid_payload');
    if (plan.operation.request.requestDigest !== requestDigest(plan.operation.request)) throw new LifecycleError('identity_conflict');
    return this.transaction(() => {
      const entry = this.event(id), event = entry.input.event;
      if (event.kind !== 'start.requested' || event.origin !== 'human' || authorization.actorId !== event.actorId ||
        authorization.evidenceRefs.length === 0 || event.installationId !== plan.request.installationId ||
        event.facts.generation !== plan.request.generation || event.provider !== plan.request.providerId || event.subjectId !== plan.request.issueId ||
        plan.run.requestId !== plan.request.id || plan.workspace.runId !== plan.run.id || plan.operation.workspaceId !== plan.workspace.id ||
        plan.operation.runId !== plan.run.id || plan.outbox.operationId !== plan.operation.id || plan.outbox.runId !== plan.run.id ||
        plan.projections.some(p => p.runId !== plan.run.id)) throw new LifecycleError('identity_conflict');
      if (entry.processed) {
        if (!entry.runId) throw new LifecycleError('identity_conflict');
        return entry.runId;
      }
      const key = [plan.request.installationId, plan.request.providerId, plan.request.issueId];
      const prior = this.db.prepare('SELECT id FROM requests WHERE installation_id=? AND provider_id=? AND issue_id=? AND generation=?')
        .get(...key, plan.request.generation);
      let runId = plan.run.id;
      if (prior) {
        const run = this.db.prepare('SELECT id FROM runs WHERE request_id=?').get(String(prior.id));
        if (!run) throw new LifecycleError('identity_conflict');
        runId = String(run.id);
      } else {
        const latest = this.db.prepare('SELECT max(generation) AS generation FROM requests WHERE installation_id=? AND provider_id=? AND issue_id=?').get(...key);
        if (Number(latest?.generation ?? 0) >= plan.request.generation) throw new LifecycleError('revision_conflict');
        this.write([plan.request, plan.run, plan.workspace, plan.operation, plan.outbox, ...plan.projections]
          .map(record => ({ record, expectedRevision: null })), authorization);
        this.db.prepare('INSERT INTO execution_bindings VALUES (?,?,?,?)').run(plan.operation.id, plan.resourceKey, plan.operation.request.requestDigest, authorization.actorId);
        this.enqueue('operation', plan.operation.id);
        for (const projection of plan.projections) this.enqueue('projection', projection.id);
      }
      this.db.prepare('UPDATE inbox SET processed=1,run_id=? WHERE id=?').run(runId, id);
      return runId;
    });
  }

  protected enqueue(kind: 'operation' | 'projection', id: string): void {
    this.db.prepare(`INSERT INTO deliveries(id,operation_id,projection_id,state,next_at) VALUES (?,?,?,'pending',?)`)
      .run(`${kind}:${id}`, kind === 'operation' ? id : null, kind === 'projection' ? id : null, this.clock.now());
  }

  delivery(id: string): Delivery {
    const row = this.db.prepare('SELECT * FROM deliveries WHERE id=?').get(id);
    if (!row) throw new LifecycleError('not_found');
    return { id, operationId: row.operation_id as string | null, projectionId: row.projection_id as string | null,
      state: row.state as Delivery['state'], attempts: Number(row.attempts), nextAt: String(row.next_at),
      lastError: row.last_error as string | null, revision: Number(row.revision) };
  }
  dueOperations(): Delivery[] {
    return this.db.prepare(`SELECT id FROM deliveries WHERE operation_id IS NOT NULL AND state IN ('pending','reconcile') AND next_at<=? ORDER BY rowid LIMIT 64`)
      .all(this.clock.now()).map(row => this.delivery(String(row.id)));
  }
  protected log(operationId: string | null, kind: string, payload: unknown): void {
    const json = JSON.stringify(payload);
    if (Buffer.byteLength(json) > 262144) throw new LifecycleError('invalid_payload');
    this.db.prepare('INSERT INTO execution_log(operation_id,at,kind,payload) VALUES (?,?,?,?)').run(operationId, this.clock.now(), kind, json);
  }
  executionHistory(operationId: string): { kind: string; payload: unknown }[] {
    return this.db.prepare('SELECT kind,payload FROM execution_log WHERE operation_id=? ORDER BY sequence').all(operationId)
      .map(row => ({ kind: String(row.kind), payload: JSON.parse(String(row.payload)) }));
  }
  protected changeOperation(id: string, state: RecordOf<'operation'>['state'], crossed: boolean, evidenceRefs: string[]): void {
    const op = this.get('operation', id);
    this.write([{ record: { ...op, state, effectBoundary: crossed ? 'crossed' : op.effectBoundary,
      revision: op.revision + 1, updatedAt: this.clock.now() }, expectedRevision: op.revision,
      recovery: op.state === 'outcome_unknown' && state !== op.state }],
    { actorId: 'coordinator', reason: 'Durable execution transition', evidenceRefs });
  }
  protected assertRunnable(id: string): void {
    const op = this.get('operation', id), run = this.get('run', op.runId);
    const request = this.get('request', run.requestId);
    const latest = this.db.prepare('SELECT max(generation) AS generation FROM requests WHERE installation_id=? AND provider_id=? AND issue_id=?')
      .get(request.installationId, request.providerId, request.issueId);
    if (this.db.prepare('SELECT paused FROM recovery_control WHERE id=1').get()!.paused === 1 || run.paused ||
      ['failed','cancelled','completed','outcome_unknown','waiting_human'].includes(run.state) || latest!.generation !== request.generation ||
      Date.parse(op.request.deadline) <= Date.parse(this.clock.now())) throw new LifecycleError('effect_blocked');
    const binding = this.db.prepare('SELECT resource_key FROM execution_bindings WHERE operation_id=?').get(id);
    if (binding && this.db.prepare('SELECT 1 FROM resource_holds WHERE resource_key=?').get(binding.resource_key)) throw new LifecycleError('effect_blocked');
    if (op.request.requestDigest !== requestDigest(op.request)) throw new LifecycleError('identity_conflict');
  }
  claim(operationId: string, executorId: string, attemptId: string): Claim {
    bounded(executorId); bounded(attemptId);
    return this.transaction(() => {
      const old = this.db.prepare('SELECT payload FROM claims WHERE operation_id=?').get(operationId);
      if (old) {
        const claim = validated('execution-record', JSON.parse(String(old.payload))) as Claim;
        if (claim.executorId !== executorId || claim.attemptId !== attemptId) throw new LifecycleError('resource_busy');
        return claim;
      }
      this.assertRunnable(operationId);
      const op = this.get('operation', operationId);
      const binding = this.db.prepare('SELECT * FROM execution_bindings WHERE operation_id=?').get(operationId);
      const delivery = this.delivery(`operation:${operationId}`);
      if (!binding || op.state !== 'prepared' || op.effectBoundary !== 'not_crossed' || delivery.state !== 'pending' ||
        Date.parse(delivery.nextAt) > Date.parse(this.clock.now())) throw new LifecycleError('effect_blocked');
      if (this.db.prepare('SELECT 1 FROM claims WHERE resource_key=? AND active=1').get(binding.resource_key)) throw new LifecycleError('resource_busy');
      const fence = Number(this.db.prepare('SELECT number FROM fences WHERE resource_key=?').get(binding.resource_key)?.number ?? 0) + 1;
      const claim = validated('execution-record', { schemaVersion: '1.0', kind: 'claim', id: this.identities.next(), operationId,
        executorId, attemptId, resourceKey: String(binding.resource_key), requestDigest: op.request.requestDigest,
        fencingNumber: fence, createdAt: this.clock.now() } as Claim);
      this.db.prepare('INSERT INTO fences VALUES (?,?) ON CONFLICT(resource_key) DO UPDATE SET number=excluded.number').run(claim.resourceKey, fence);
      this.db.prepare('INSERT INTO claims(id,operation_id,resource_key,payload) VALUES (?,?,?,?)').run(claim.id, operationId, claim.resourceKey, JSON.stringify(claim));
      this.changeOperation(operationId, 'claimed', false, []);
      this.db.prepare("UPDATE deliveries SET state='reconcile',revision=revision+1 WHERE operation_id=?").run(operationId);
      this.log(operationId, 'claim', claim);
      return claim;
    });
  }
  protected checkClaim(claim: Claim): { consumed: number; active: number } {
    const safe = validated('execution-record', claim);
    const row = this.db.prepare('SELECT payload,consumed,active FROM claims WHERE id=? AND operation_id=?').get(claim.id, claim.operationId);
    if (!row || canonical(JSON.parse(String(row.payload))) !== canonical(safe)) throw new LifecycleError('identity_conflict');
    return { consumed: Number(row.consumed), active: Number(row.active) };
  }
  beginEffect(claim: Claim): void {
    this.transaction(() => {
      const row = this.checkClaim(claim);
      if (!row.active || row.consumed) throw new LifecycleError('effect_consumed');
      this.assertRunnable(claim.operationId);
      if (this.get('operation', claim.operationId).state !== 'claimed') throw new LifecycleError('effect_blocked');
      this.db.prepare('UPDATE claims SET consumed=1 WHERE id=?').run(claim.id);
      this.changeOperation(claim.operationId, 'running', true, []);
      this.log(claim.operationId, 'effect_boundary', claim);
    });
  }
  markUnknown(operationId: string): void {
    this.transaction(() => {
      const op = this.get('operation', operationId);
      if (['succeeded','failed','cancelled'].includes(op.state)) return;
      if (op.state !== 'outcome_unknown') this.changeOperation(operationId, 'outcome_unknown', false, []);
      this.db.prepare("UPDATE deliveries SET state='reconcile',last_error='outcome_unknown',revision=revision+1 WHERE operation_id=?").run(operationId);
      this.log(operationId, 'outcome_unknown', { schemaVersion: '1.0' });
    });
  }
  operationHandle(operationId: string): string | null {
    const row = this.db.prepare("SELECT payload FROM execution_log WHERE operation_id=? AND kind='observation' AND json_extract(payload,'$.result.handle') IS NOT NULL ORDER BY sequence DESC LIMIT 1").get(operationId);
    return row ? (JSON.parse(String(row.payload)) as BoundResult).result.handle : null;
  }
  recoveryEpoch(): number { return Number(this.db.prepare('SELECT epoch FROM recovery_control WHERE id=1').get()!.epoch); }
  private finishDelivery(operationId: string, observed: boolean): void {
    if (observed) this.db.prepare('UPDATE restore_checks SET resolved=1 WHERE operation_id=?').run(operationId);
    this.db.prepare(`UPDATE deliveries SET state=CASE WHEN EXISTS(SELECT 1 FROM restore_checks WHERE operation_id=? AND resolved=0)
      THEN 'reconcile' ELSE 'done' END,last_error=NULL,revision=revision+1 WHERE operation_id=? AND state!='conflict'`).run(operationId,operationId);
  }
  acceptResult(input: BoundResult, claim: Claim | null, expectedRevision: number, projections: RecordOf<'projection'>[] = [], observedEpoch = 0): boolean {
    const bound = validated('execution-record', input);
    if (bound.kind !== 'result') throw new LifecycleError('invalid_payload');
    return this.transaction(() => {
      if (!claim && observedEpoch !== this.recoveryEpoch()) throw new LifecycleError('revision_conflict');
      const op = this.get('operation', bound.operationId);
      if (bound.requestDigest !== op.request.requestDigest || (claim && claim.operationId !== op.id)) throw new LifecycleError('identity_conflict');
      if (claim && !this.checkClaim(claim).consumed) throw new LifecycleError('effect_blocked');
      const handle = this.operationHandle(op.id);
      if (handle && bound.result.handle && handle !== bound.result.handle) throw new LifecycleError('identity_conflict');
      const existing = this.db.prepare('SELECT payload FROM execution_results WHERE operation_id=?').get(op.id);
      if (existing) {
        if (canonical(JSON.parse(String(existing.payload))) === canonical(bound)) {
          this.finishDelivery(op.id, !claim);
          return true;
        }
        this.log(op.id, 'result_conflict', bound);
        this.db.prepare("UPDATE deliveries SET state='conflict',last_error='identity_conflict',revision=revision+1 WHERE operation_id=?").run(op.id);
        // Conflicting terminal evidence never changes history or silently grants another effect.
        const binding = this.db.prepare('SELECT resource_key FROM execution_bindings WHERE operation_id=?').get(op.id);
        if (binding) this.db.prepare('INSERT OR IGNORE INTO resource_holds VALUES (?,?)').run(binding.resource_key, 'conflicting_terminal_result');
        return false;
      }
      if (!claim && op.revision !== expectedRevision) throw new LifecycleError('revision_conflict');
      if (!claim && op.state !== 'outcome_unknown') throw new LifecycleError('recovery_required');
      if (bound.result.status === 'outcome_unknown') {
        if (op.state !== 'outcome_unknown') this.changeOperation(op.id, 'outcome_unknown', false, []);
      } else if (bound.result.status !== 'accepted') {
        if (bound.result.evidenceRefs.length === 0) throw new LifecycleError('invalid_payload');
        this.changeOperation(op.id, bound.result.status, true, bound.result.evidenceRefs);
        const workspace = this.get('workspace', op.workspaceId);
        for (let offset = 0; offset < bound.result.resources.length; offset += 64)
          this.write(bound.result.resources.slice(offset, offset + 64).map(resource => ({ expectedRevision: null, record: {
          schemaVersion: '1.0', kind: 'resource', id: this.identities.next(), revision: 1, createdAt: this.clock.now(), updatedAt: this.clock.now(),
          runId: op.runId, workspaceId: op.workspaceId, createdByOperation: op.id, resourceType: resource.type,
          providerId: op.request.actionId, locator: resource.id, ownershipRef: workspace.ownershipRef, cleanupPolicy: 'retain',
        } })), { actorId: 'coordinator', reason: 'Observed action resources; providerId identifies the action producer', evidenceRefs: bound.result.evidenceRefs });
        this.db.prepare('INSERT INTO execution_results VALUES (?,?)').run(op.id, JSON.stringify(bound));
        this.db.prepare('UPDATE claims SET active=0 WHERE operation_id=?').run(op.id);
        this.finishDelivery(op.id, !claim);
        if (projections.length) {
          if (projections.some(p => p.runId !== op.runId || p.kind !== 'projection')) throw new LifecycleError('identity_conflict');
          this.write(projections.map(record => ({ record, expectedRevision: null })), { actorId: 'coordinator', reason: 'Observed operation result projection', evidenceRefs: bound.result.evidenceRefs });
          for (const p of projections) this.enqueue('projection', p.id);
        }
      }
      this.log(op.id, 'observation', bound);
      return true;
    });
  }
  block(id: string, code: string): void {
    if (!['unsupported_capability','validation_failed','effect_blocked'].includes(code)) throw new LifecycleError('invalid_payload');
    this.transaction(() => {
      const d = this.delivery(id);
      if (!['pending','reconcile'].includes(d.state)) return;
      this.db.prepare("UPDATE deliveries SET state='blocked',last_error=?,revision=revision+1 WHERE id=?").run(code,id);
      this.log(d.operationId, 'blocked', { id, code });
    });
  }
  retryRead(id: string, policy: RetryPolicy, random: number): void {
    if (!Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1 || policy.maxAttempts > 100 ||
      !Number.isFinite(policy.baseMs) || policy.baseMs < 1 || !Number.isFinite(policy.capMs) || policy.capMs < policy.baseMs ||
      policy.capMs > 86400000 || !Number.isFinite(random) || random < 0 || random > 1) throw new LifecycleError('invalid_payload');
    this.transaction(() => {
      const d = this.delivery(id);
      if (!['pending','reconcile'].includes(d.state)) return;
      const attempts = d.attempts + 1;
      const delay = Math.min(policy.capMs, policy.baseMs * 2 ** Math.min(attempts - 1, 30)) * (0.5 + random * 0.5);
      const next = new Date(Date.parse(this.clock.now()) + delay).toISOString();
      this.db.prepare('UPDATE deliveries SET attempts=?,state=?,next_at=?,last_error=?,revision=revision+1 WHERE id=?')
        .run(attempts, attempts >= policy.maxAttempts ? 'blocked' : d.state, next, 'observation_unavailable', id);
      this.log(d.operationId, 'retry_scheduled', { id, attempts, next });
    });
  }
  resumeObservation(id: string, context: AuditContext): void {
    context = recoveryContext(context);
    this.transaction(() => {
      const d = this.delivery(id);
      if (d.state !== 'blocked') throw new LifecycleError('invalid_transition');
      // Explicit recovery resumes observation only, never the action start method.
      this.db.prepare("UPDATE deliveries SET state='reconcile',attempts=0,next_at=?,revision=revision+1 WHERE id=?").run(this.clock.now(), id);
      this.log(d.operationId, 'resume_observation', context);
    });
  }
  enterRestore(context: AuditContext): void {
    context = recoveryContext(context);
    this.transaction(() => {
      this.db.exec('UPDATE recovery_control SET paused=1,epoch=epoch+1 WHERE id=1');
      this.db.exec(`INSERT INTO restore_checks SELECT id,(SELECT epoch FROM recovery_control WHERE id=1),0 FROM operations WHERE true
        ON CONFLICT(operation_id) DO UPDATE SET epoch=excluded.epoch,resolved=0`);
      this.db.prepare("UPDATE deliveries SET state='reconcile',attempts=0,next_at=?,revision=revision+1 WHERE operation_id IS NOT NULL").run(this.clock.now());
      this.log(null, 'restore_paused', context);
    });
  }
  resumeAfterRestore(context: AuditContext): void {
    context = recoveryContext(context);
    this.transaction(() => {
      if (this.db.prepare('SELECT 1 FROM restore_checks WHERE resolved=0').get()) throw new LifecycleError('recovery_required');
      this.db.exec('UPDATE recovery_control SET paused=0 WHERE id=1'); this.log(null, 'restore_resumed', context);
    });
  }
}
