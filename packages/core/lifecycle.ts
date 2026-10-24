import type { LabstrideLifecycleRecord } from '../../contracts/generated/lifecycle-record.ts';

export type LifecycleRecord = LabstrideLifecycleRecord;
export type Kind = LifecycleRecord['kind'];
export type RecordOf<K extends Kind> = Extract<LifecycleRecord, { kind: K }>;
export type ErrorCode = 'invalid_payload' | 'not_found' | 'identity_conflict' | 'revision_conflict' |
  'invalid_transition' | 'recovery_required' | 'storage_busy' | 'storage_failure' |
  'migration_failed' | 'unsupported_schema' | 'unsafe_state_path' | 'resource_busy' | 'effect_consumed' | 'effect_blocked' | 'capacity_wait' | 'issue_busy' | 'unsupported_capability' | 'stale_revision' |
  'identity_rejected' | 'provider_unavailable' | 'claim_conflict' | 'receipt_conflict' | 'broker_unavailable';

export class LifecycleError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) { super(code); this.name = 'LifecycleError'; this.code = code; }
}

export interface AuditContext { actorId: string; reason: string; evidenceRefs: string[] }
export interface Change {
  record: LifecycleRecord;
  expectedRevision: number | null;
  recovery?: boolean;
}
export interface AuditRecord extends AuditContext {
  schemaVersion: '1.0'; id: string; at: string; recovery: boolean;
  previousRevision: number | null; record: LifecycleRecord;
}
export interface RecoverySnapshot {
  schemaVersion: '1.0'; records: LifecycleRecord[]; pendingIntents: RecordOf<'outbox'>[];
  reconciliationRequired: RecordOf<'operation'>[];
}
export interface StateStore {
  commit(changes: Change[], context: AuditContext): void;
  get<K extends Kind>(kind: K, id: string): RecordOf<K>;
  snapshot(): RecoverySnapshot;
  history(runId: string): { records: LifecycleRecord[]; audit: AuditRecord[] };
  close(): void;
}
export interface Clock { now(): string }
export interface IdentityProvider { next(): string }

// All unlisted edges are rejected. These guards record facts; they authorize no external effect.
const edges: Partial<Record<Kind, Record<string, readonly string[]>>> = {
  run: {
    queued: ['preparing', 'cancelled', 'failed'], preparing: ['ready', 'failed', 'cancelled', 'outcome_unknown'],
    ready: ['active', 'failed', 'cancelled'],
    active: ['waiting_human', 'waiting_ci', 'delivering', 'completed', 'failed', 'cancelled', 'outcome_unknown'],
    waiting_human: ['active', 'failed', 'cancelled', 'outcome_unknown'],
    waiting_ci: ['active', 'delivering', 'completed', 'failed', 'cancelled', 'outcome_unknown'],
    delivering: ['completed', 'failed', 'cancelled', 'outcome_unknown'],
  },
  workspace: {
    requested: ['creating', 'error'], creating: ['ready', 'error', 'outcome_unknown'],
    ready: ['in_use', 'retained', 'cleanup_pending', 'error', 'outcome_unknown'],
    in_use: ['ready', 'retained', 'error', 'outcome_unknown'],
    retained: ['ready', 'cleanup_pending', 'error', 'outcome_unknown'],
    cleanup_pending: ['retained', 'deleting', 'error', 'outcome_unknown'], deleting: ['deleted', 'retained', 'error', 'outcome_unknown'],
  },
  operation: { prepared: ['claimed', 'cancelled', 'outcome_unknown'], claimed: ['running', 'failed', 'cancelled', 'outcome_unknown'],
    running: ['succeeded', 'failed', 'cancelled', 'outcome_unknown', 'superseded'] },
  deployment: { requested: ['running', 'failed', 'superseded'], running: ['verified', 'failed', 'outcome_unknown'] },
  session: { ready: ['busy', 'waiting_human', 'closed', 'failed', 'outcome_unknown'],
    busy: ['ready', 'waiting_human', 'closed', 'failed', 'outcome_unknown'],
    waiting_human: ['ready', 'busy', 'closed', 'failed', 'outcome_unknown'] },
};
const initial: Partial<Record<Kind, string>> = {
  run: 'queued', workspace: 'requested', operation: 'prepared', deployment: 'requested', session: 'ready',
};
const immutableFields: Partial<Record<Kind, readonly string[]>> = {
  request: ['installationId', 'providerId', 'issueId', 'generation'],
  run: ['requestId', 'repositoryId', 'configRevision'],
  workspace: ['runId', 'targetId', 'locator', 'localPath', 'ownershipRef', 'branch'],
  operation: ['runId', 'workspaceId', 'request'], deployment: ['runId', 'operationId', 'targetId', 'sourceSha'],
  session: ['runId', 'workspaceId', 'providerId', 'sessionId'],
  outbox: ['runId', 'operationId', 'intentKey', 'payload'],
  projection: ['runId', 'providerId', 'subjectId', 'fieldId', 'generation', 'payload'],
};

export function checkChange(previous: LifecycleRecord | undefined, change: Change): void {
  const next = change.record;
  if (!previous) {
    if (change.expectedRevision !== null || next.revision !== 1 || change.recovery)
      throw new LifecycleError('revision_conflict');
    if ('state' in next && initial[next.kind] && next.state !== initial[next.kind])
      throw new LifecycleError('invalid_transition');
    if (next.kind === 'run' && next.paused) throw new LifecycleError('invalid_transition');
    if (next.kind === 'operation' && next.effectBoundary !== 'not_crossed') throw new LifecycleError('invalid_transition');
    return;
  }
  if (change.expectedRevision !== previous.revision || next.revision !== previous.revision + 1)
    throw new LifecycleError('revision_conflict');
  if (next.kind !== previous.kind || next.id !== previous.id || next.createdAt !== previous.createdAt)
    throw new LifecycleError('identity_conflict');
  for (const key of immutableFields[next.kind] ?? []) {
    if (JSON.stringify(previous[key as keyof typeof previous]) !== JSON.stringify(next[key as keyof typeof next]))
      throw new LifecycleError('identity_conflict');
  }
  if (Date.parse(next.updatedAt) < Date.parse(previous.updatedAt)) throw new LifecycleError('invalid_payload');
  const graph = edges[next.kind];
  if (graph && 'state' in previous && 'state' in next) {
    const oldState = previous.state;
    const newState = next.state;
    const recoverable = oldState === 'outcome_unknown' ||
      (next.kind === 'run' && oldState === 'failed') ||
      (next.kind === 'workspace' && oldState === 'error');
    if (recoverable && newState !== oldState) {
      if (!change.recovery) throw new LifecycleError('recovery_required');
      if (newState === 'outcome_unknown' || !(newState in graph ||
        ['completed', 'cancelled', 'deleted', 'succeeded', 'failed', 'verified', 'closed', 'superseded'].includes(newState)))
        throw new LifecycleError('invalid_transition');
    } else {
      if (change.recovery || (!graph[oldState]) ||
        (newState !== oldState && !graph[oldState].includes(newState)))
        throw new LifecycleError('invalid_transition');
    }
  } else if (['request', 'outbox', 'projection', 'resource', 'evidence'].includes(next.kind)) {
    // Immutable descriptors. Dispatch/projection workers are introduced by W01.2/W02.
    throw new LifecycleError('invalid_transition');
  }
  if (previous.kind === 'session' && next.kind === 'session' &&
    next.humanActivityRevision < previous.humanActivityRevision) throw new LifecycleError('revision_conflict');
  if (previous.kind === 'operation' && next.kind === 'operation' &&
    previous.effectBoundary === 'crossed' && next.effectBoundary !== 'crossed')
    throw new LifecycleError('invalid_transition');
}

export function createCoordinator(store: StateStore, clock: Clock, identities: IdentityProvider) {
  return {
    recover: (): RecoverySnapshot => store.snapshot(),
    commit(changes: Change[], actorId: string, reason: string, evidenceRefs: string[] = []) {
      store.commit(changes, { actorId, reason, evidenceRefs });
    },
    identity: () => identities.next(), now: () => clock.now(), close: () => store.close(),
  };
}
