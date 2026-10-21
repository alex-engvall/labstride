import { createHash } from 'node:crypto';
import { SqliteStore } from './store.ts';
import { validated } from './validation.ts';
import { LifecycleError } from '../core/lifecycle.ts';
import type { AuditContext } from '../core/lifecycle.ts';
import type { InboxEntry, InboxInput, InboxStore, StartPlan } from '../core/execution.ts';

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
    const hash = digest(event);
    const existing = this.db.prepare('SELECT id,digest FROM inbox WHERE installation_id=? AND provider_id=? AND stream=? AND external_id=?').get(...identity);
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
}
