import { DatabaseSync } from 'node:sqlite';
import { chmodSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { validated } from '../storage-sqlite/validation.ts';
import { requestDigest, digest } from '../storage-sqlite/execution.ts';
import { assertPrivateDatabase, withRoot, TargetError } from './filesystem.ts';
import type { TrustedTargetHelperPolicyV1 } from '../../contracts/generated/ssh-helper-policy.ts';
import type { TrustedTargetHelperRequestV1 } from '../../contracts/generated/ssh-helper-request.ts';
import type { TrustedTargetHelperResponseV1 } from '../../contracts/generated/ssh-helper-response.ts';
import type { TargetRegistryReservationV1 } from '../../contracts/generated/ssh-reservation.ts';
export type HelperPolicy = TrustedTargetHelperPolicyV1;
export type HelperRequest = TrustedTargetHelperRequestV1;
export type HelperResponse = TrustedTargetHelperResponseV1;
export const reserveAction = 'labstride.target-reserve';
export const reserveVersion = '1.0.0';
export const capabilities = ['target.probe.v1', 'target.reserve.v1', 'target.inspect.v1'] as const;
export const locatorFor = (installationId: string, targetId: string, workspaceId: string) =>
  `ws-${createHash('sha256').update(JSON.stringify([installationId, targetId, workspaceId])).digest('hex').slice(0, 40)}`;

export function validateHelperRequest(policy: HelperPolicy, value: unknown): HelperRequest {
  const request = validated<HelperRequest>('ssh-helper-request', value as HelperRequest);
  if (request.installationId !== policy.installationId || request.targetId !== policy.targetId || request.targetRevision !== policy.targetRevision)
    throw new TargetError('identity_mismatch');
  if (request.method !== 'probe') {
    const op = request.operation!;
    if (op.targetId !== request.targetId || op.actionId !== reserveAction || op.actionVersion !== reserveVersion ||
      op.requestDigest !== requestDigest(op) || request.requestId !== op.operationId ||
      Object.keys(op.inputs).length !== 1 || typeof op.inputs.rootId !== 'string') throw new TargetError('validation_failed');
    if (!policy.roots.some(root => root.id === op.inputs.rootId)) throw new TargetError('forbidden');
  }
  return request;
}

export class TargetRegistry {
  private db: DatabaseSync;
  private barrier: (stage: 'before-commit' | 'after-commit') => void;
  readonly policy: HelperPolicy;
  constructor(policy: HelperPolicy, barrier: (stage: 'before-commit' | 'after-commit') => void = () => {}) {
    this.barrier = barrier;
    this.policy = validated('ssh-helper-policy', policy);
    if (process.platform !== 'linux' || process.getuid!() !== policy.helperUid || policy.codingUid === policy.helperUid ||
      new Set(policy.roots.map(root => root.id)).size !== policy.roots.length ||
      policy.roots.some(root => ![0, policy.helperUid].includes(root.identity.uid))) throw new TargetError('configuration_invalid');
    const contains = (a: string, b: string) => { const path = relative(a,b); return path === '' || (!path.startsWith('..') && !isAbsolute(path)); };
    if (policy.roots.some(root => contains(root.path, policy.stateDir) || contains(policy.stateDir, root.path))) throw new TargetError('configuration_invalid');
    for (const root of policy.roots) withRoot(root.path, root.identity, () => {});
    assertPrivateDatabase(policy.stateDir, 'target.sqlite');
    const path = join(policy.stateDir, 'target.sqlite');
    this.db = new DatabaseSync(path, { timeout: 5000 });
    const version = this.db.prepare('PRAGMA user_version').get()!.user_version;
    if (version !== 0 && version !== 1 && version !== 2 && version !== 3) { this.db.close(); throw new TargetError('configuration_invalid'); }
    if (version === 0 && this.db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get()) {
      this.db.close(); throw new TargetError('configuration_invalid');
    }
    if ((version === 1 || version === 2 || version === 3) && this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
      .map(row => row.name).join(',') !== (version === 3 ? 'cleanup_deletions,reservations,target_identity,workspace_creations,workspace_uses' : version === 2 ? 'reservations,target_identity,workspace_creations' : 'reservations,target_identity')) { this.db.close(); throw new TargetError('configuration_invalid'); }
    chmodSync(path, 0o600); this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
    this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS target_identity (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reservations (operation_id TEXT PRIMARY KEY, workspace_id TEXT UNIQUE NOT NULL,
        request_digest TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));
      CREATE TRIGGER IF NOT EXISTS reservation_immutable BEFORE UPDATE ON reservations BEGIN SELECT RAISE(ABORT,'immutable'); END;
      CREATE TRIGGER IF NOT EXISTS reservation_retained BEFORE DELETE ON reservations BEGIN SELECT RAISE(ABORT,'immutable'); END;
      PRAGMA user_version=${version >= 2 ? version : 1}; COMMIT;`);
    const target = JSON.stringify([policy.installationId, policy.targetId]);
    this.db.prepare('INSERT OR IGNORE INTO target_identity VALUES (1,?)').run(target);
    if (this.db.prepare('SELECT payload FROM target_identity WHERE id=1').get()!.payload !== target) {
      this.db.close(); throw new TargetError('identity_mismatch');
    }
  }
  handle(value: unknown): HelperResponse {
    const request = validated<HelperRequest>('ssh-helper-request', value as HelperRequest);
    const base = { schemaVersion: '1.0' as const, requestId: request.requestId, installationId: request.installationId,
      targetId: request.targetId, targetRevision: request.targetRevision, method: request.method };
    let commitUncertain = false;
    try {
      validateHelperRequest(this.policy, request);
      if (request.method === 'probe') {
        for (const root of this.policy.roots) withRoot(root.path, root.identity, () => {});
        return validated('ssh-helper-response', { ...base, outcome: 'ok', reservation: null, capabilities: [...capabilities], error: null });
      }
      const op = request.operation!;
      const root = this.policy.roots.find(root => root.id === op.inputs.rootId);
      if (!root) throw new TargetError('forbidden');
      const locator = locatorFor(request.installationId, request.targetId, op.workspaceId);
      const expected: TargetRegistryReservationV1 = validated('ssh-reservation', { schemaVersion: '1.0',
        installationId: request.installationId, targetId: request.targetId, targetRevision: request.targetRevision,
        runId: op.runId, workspaceId: op.workspaceId, operationId: op.operationId, requestDigest: op.requestDigest,
        rootId: root.id, locator, state: 'reserved' });
      const reservation = withRoot(root.path, root.identity, absent => {
        this.db.exec('BEGIN IMMEDIATE');
        try {
          const row = this.db.prepare('SELECT payload FROM reservations WHERE operation_id=?').get(op.operationId);
          absent(locator);
          if (row) {
            const saved = validated<TargetRegistryReservationV1>('ssh-reservation', JSON.parse(String(row.payload)));
            if (digest(saved) !== digest(expected)) throw new TargetError('identity_mismatch');
            this.db.exec('COMMIT'); return saved;
          }
          if (request.method === 'inspect') throw new TargetError('outcome_unknown');
          if (Date.parse(op.deadline) <= Date.now()) throw new TargetError('forbidden');
          if (this.db.prepare('SELECT 1 FROM reservations WHERE workspace_id=?').get(op.workspaceId)) throw new TargetError('resource_busy');
          this.db.prepare('INSERT INTO reservations VALUES (?,?,?,?)').run(op.operationId, op.workspaceId, op.requestDigest, JSON.stringify(expected));
          this.barrier('before-commit'); absent(locator);
          // A COMMIT error or post-commit observation failure cannot establish
          // that this reservation did not become durable.
          commitUncertain = true;
          this.db.exec('COMMIT'); this.barrier('after-commit'); return expected;
        } catch (error) {
          if (this.db.isTransaction) {
            try { this.db.exec('ROLLBACK'); } catch { commitUncertain = true; }
          }
          throw error;
        }
      });
      return validated('ssh-helper-response', { ...base, outcome: 'ok', reservation, capabilities: [...capabilities], error: null });
    } catch (error) {
      const code = commitUncertain || !(error instanceof TargetError) ? 'outcome_unknown' : error.code;
      return validated('ssh-helper-response', { ...base, outcome: code === 'outcome_unknown' ? 'outcome_unknown' : 'error', reservation: null,
        capabilities: [], error: { code, message: code, evidenceId: null, retryClass: code === 'outcome_unknown' ? 'reconcile' : 'none' } });
    }
  }
  close() { this.db.close(); }
}
