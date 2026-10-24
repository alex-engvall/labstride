import { DatabaseSync } from 'node:sqlite';
import { chmodSync, lstatSync, mkdirSync, readdirSync, renameSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { WorkspaceRegistry } from './workspaces.ts';
import { assertPrivateDatabase, directoryIdentity, sameIdentity, TargetError, withWorkspaceRoot } from './filesystem.ts';
import { absent, assertNoWriters, syncDirectory, walkOwned } from './cleanup-filesystem.ts';
import { inspectCleanupGit } from './cleanup-git.ts';
import type { CleanupGitOptions } from './cleanup-git.ts';
import { sourceAccess } from './workspace-git.ts';
import type { WorkspacePolicy, WorkspaceReceipt } from './workspace-contracts.ts';
import { validated } from '../storage-sqlite/validation.ts';
import { digest, canonical, requestDigest } from '../storage-sqlite/execution.ts';
import type { TrustedCleanupDeletionRequestV5 as Request } from '../../contracts/generated/ssh-cleanup-delete-request.ts';
import type { TrustedCleanupDeletionResponseV5 as Response } from '../../contracts/generated/ssh-cleanup-delete-response.ts';
import type { CleanupDeletionActionInputV2 } from '../../contracts/generated/cleanup-delete-input.ts';
import type { CleanupPreparationV1 } from '../../contracts/generated/cleanup-preparation.ts';
import type { CleanupTombstoneV1 } from '../../contracts/generated/cleanup-tombstone.ts';
export type DeletionStage = 'intent' | 'fenced' | 'prepared' | 'moving' | 'moved' | 'unlink' | 'removed' | 'tombstone';
export interface DeletionDependencies {
  // Trusted test seams, never accepted from policy, source, issue or wire data.
  quiescence?: typeof assertNoWriters;
  git?: CleanupGitOptions;
  barrier?: (stage: DeletionStage) => void;
}
type Saved = { operation_id: string; workspace_id: string; request: string; receipt: string; state: Response['state']; preparation: string | null; tombstone: string | null; area_identity: string | null; blockers: string };
export class CleanupDeletionRegistry {
  private workspaces: WorkspaceRegistry;
  private db: DatabaseSync;
  private mutex: DatabaseSync;
  private policy: WorkspacePolicy;
  private dependencies: DeletionDependencies;
  constructor(input: WorkspacePolicy, dependencies: DeletionDependencies = {}) {
    this.policy = validated('ssh-workspace-policy', input); this.dependencies = dependencies;
    this.workspaces = new WorkspaceRegistry(this.policy);
    assertPrivateDatabase(this.policy.stateDir, 'cleanup-lock.sqlite');
    this.mutex = new DatabaseSync(join(this.policy.stateDir, 'cleanup-lock.sqlite'), { timeout: 5000 });
    chmodSync(join(this.policy.stateDir, 'cleanup-lock.sqlite'), 0o600);
    this.mutex.exec('CREATE TABLE IF NOT EXISTS mutex (id INTEGER PRIMARY KEY);');
    this.db = new DatabaseSync(join(this.policy.stateDir, 'target.sqlite'), { timeout: 5000 });
    this.db.exec('PRAGMA synchronous=FULL');
  }
  private atomic(work: () => void): void {
    this.db.exec('BEGIN IMMEDIATE');
    try { work(); this.db.exec('COMMIT'); } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private saved(id: string): Saved | undefined { return this.db.prepare('SELECT * FROM cleanup_deletions WHERE operation_id=?').get(id) as Saved | undefined; }
  handle(input: unknown): Response {
    const request = validated('ssh-cleanup-delete-request', input as Request), p = this.policy, op = request.operation;
    const inputs = validated('cleanup-delete-input', op.inputs as unknown as CleanupDeletionActionInputV2);
    const { operation: _op, authorization: _auth, ...base } = request;
    const reply = (saved?: Saved, blockers: string[] = []): Response => validated('ssh-cleanup-delete-response', { ...base,
      state: saved?.state ?? 'outcome_unknown', blockers: blockers.length ? blockers : saved ? JSON.parse(saved.blockers) : ['deletion_unknown'],
      preparation: saved?.preparation ? JSON.parse(saved.preparation) : null, tombstone: saved?.tombstone ? JSON.parse(saved.tombstone) : null });
    if (request.installationId !== p.installationId || request.targetId !== p.targetId || request.targetRevision !== p.targetRevision ||
      request.requestId !== op.operationId || op.requestDigest !== requestDigest(op) || op.targetId !== p.targetId || op.workspaceId !== inputs.workspaceId ||
      op.actionId !== inputs.policy.actionId || op.actionVersion !== inputs.policy.actionVersion ||
      (request.method === 'commit') !== (request.authorization !== null)) return reply(undefined, ['identity_mismatch']);
    let locked = false;
    try {
      this.mutex.exec('BEGIN IMMEDIATE'); locked = true;
      let saved = this.saved(op.operationId);
      if (saved && saved.request !== canonical(op)) return reply(undefined, ['identity_mismatch']);
      // Completed requests return immutable evidence without revisiting the workspace locator.
      if (saved?.tombstone) return reply(saved);
      if (!p.cleanup || p.cleanup.profile !== 'linux-exclusive-writers.v1') return reply(undefined, ['unsupported_capability']);
      if (!saved) {
        if (request.method !== 'prepare' || Date.parse(op.deadline) <= Date.now()) return reply();
        const created = this.db.prepare("SELECT receipt FROM workspace_creations WHERE operation_id=? AND state='ready'").get(inputs.creationOperationId);
        if (!created?.receipt) return reply();
        const receipt = validated('ssh-workspace-receipt', JSON.parse(String(created.receipt)) as WorkspaceReceipt);
        if (receipt.workspaceId !== op.workspaceId || receipt.runId !== op.runId || digest(receipt) !== inputs.receiptDigest || digest(receipt.source) !== digest(op.source)) return reply(undefined, ['identity_mismatch']);
        const root = p.roots.find(root => root.id === receipt.rootId); if (!root) return reply();
        withWorkspaceRoot(root.path, root.identity, directory => this.workspaces.checkPublished(join(directory, receipt.locator), receipt));
        this.atomic(() => {
          if (this.db.prepare('SELECT 1 FROM workspace_uses WHERE workspace_id=? AND active=1').get(op.workspaceId)) throw new TargetError('resource_busy');
          this.db.prepare("INSERT INTO cleanup_deletions(operation_id,workspace_id,request,receipt,state) VALUES (?,?,?,?,'fenced')")
            .run(op.operationId, op.workspaceId, canonical(op), canonical(receipt));
        });
        this.dependencies.barrier?.('intent'); saved = this.saved(op.operationId)!;
      }
      const receipt = validated('ssh-workspace-receipt', JSON.parse(saved.receipt) as WorkspaceReceipt);
      const root = p.roots.find(root => root.id === receipt.rootId); if (!root) return reply();
      if (saved.state === 'released' || saved.state === 'blocked') return reply(saved);
      return withWorkspaceRoot(root.path, root.identity, (directory, checkRoot) => {
        const original = join(directory, receipt.locator), area = join(directory, '.labstride-deleting');
        const destination = join(area, digest([p.installationId, p.targetId, op.operationId]));
        const update = (state: Response['state'], blockers: string[] = []) => this.atomic(() => {
          this.db.prepare('UPDATE cleanup_deletions SET state=?,blockers=? WHERE operation_id=?').run(state, canonical(blockers), op.operationId);
        });
        const assertOriginal = () => this.workspaces.checkPublished(original, receipt, true);
        const writers = () => (this.dependencies.quiescence ?? assertNoWriters)(p);
        const identity = { schemaVersion: '1.0' as const, installationId: p.installationId, targetId: p.targetId, targetRevision: p.targetRevision,
          workspaceId: op.workspaceId, creationOperationId: inputs.creationOperationId, receiptDigest: inputs.receiptDigest,
          operationId: op.operationId, requestDigest: op.requestDigest, policyDigest: digest(inputs.policy) };
        if (saved!.state === 'fenced' || saved!.state === 'prepared') {
          assertOriginal();
          // Intent was committed before chmod. The wrapper and marker are owned
          // by the helper, so a coding process cannot swap either.
          chmodSync(original, 0o700); syncDirectory(original); this.dependencies.barrier?.('fenced');
          if (request.method === 'release') {
            assertOriginal(); chmodSync(original, 0o750); syncDirectory(original); update('released'); return reply(this.saved(op.operationId));
          }
          if (request.method === 'inspect') return reply(this.saved(op.operationId));
          try {
            writers();
            if (readdirSync(original).sort().join(',') !== 'source,workspace.json') throw new TargetError('resource_busy');
            walkOwned(original, receipt.directoryIdentity, p);
            const source = p.sources.find(source => source.repositoryId === receipt.source.repositoryId)!;
            const inspected = inspectCleanupGit(join(original.replace('/proc/self/', `/proc/${process.pid}/`), 'source'), sourceAccess(source), inputs.policy.regenerableIgnoredPaths, this.dependencies.git);
            if (inspected.blockers.length || !inspected.remoteRefsDigest) throw new TargetError('resource_busy');
            assertOriginal(); writers(); checkRoot();
            if (saved!.state === 'fenced') {
              const preparation: CleanupPreparationV1 = { ...identity, preparedAt: new Date().toISOString(), inspection: { schemaVersion: '1.0', requestId: op.operationId,
                installationId: p.installationId, targetId: p.targetId, workspaceId: op.workspaceId, creationOperationId: inputs.creationOperationId,
                receiptDigest: inputs.receiptDigest, policyDigest: digest(inputs.policy), observedAt: new Date().toISOString(), ...inspected } };
              this.atomic(() => this.db.prepare("UPDATE cleanup_deletions SET state='prepared',preparation=? WHERE operation_id=?").run(canonical(preparation), op.operationId));
              this.dependencies.barrier?.('prepared');
              if (request.method !== 'commit') return reply(this.saved(op.operationId));
            }
          } catch (error) {
            assertOriginal(); chmodSync(original, 0o750); syncDirectory(original);
            update('blocked', [error instanceof TargetError ? error.code : 'quiescence_unknown']); return reply(this.saved(op.operationId));
          }
          const prepared = this.saved(op.operationId)!;
          const auth = request.authorization;
          if (request.method !== 'commit' || !auth || auth.preparedDigest !== digest(JSON.parse(prepared.preparation!)) ||
            Date.parse(op.deadline) <= Date.now() || Date.parse(auth.expiresAt) <= Date.now() || Date.parse(auth.expiresAt) > Date.now() + 30000) return reply(prepared, ['authorization_stale']);
          if (!absent(area)) {
            const info = lstatSync(area);
            if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== p.helperUid || (info.mode & 0o777) !== 0o700 ||
              directoryIdentity(area).mountId !== root.identity.mountId) throw new TargetError('identity_mismatch');
          } else { mkdirSync(area, { mode: 0o700 }); syncDirectory(directory); }
          if (!absent(destination)) throw new TargetError('identity_mismatch');
          syncDirectory(area);
          assertOriginal(); checkRoot();
          const areaIdentity=directoryIdentity(area);
          this.atomic(()=>this.db.prepare("UPDATE cleanup_deletions SET state='moving',area_identity=? WHERE operation_id=?").run(canonical(areaIdentity),op.operationId));
          this.dependencies.barrier?.('moving');
          checkRoot(); assertOriginal();
          renameSync(original, destination); syncDirectory(directory); syncDirectory(area); this.dependencies.barrier?.('moved');
          update('removing');
        }
        saved = this.saved(op.operationId)!;
        if (['moving','removing'].includes(saved.state) && (!saved.area_identity || !sameIdentity(directoryIdentity(area),JSON.parse(saved.area_identity)))) throw new TargetError('identity_mismatch');
        if (saved.state === 'moving') {
          // A crash may occur on either side of rename. Never move from the
          // original locator during reconciliation, even when it still exists.
          if (absent(destination)) return reply(saved, ['move_unknown']);
          if (!sameIdentity(directoryIdentity(destination), receipt.directoryIdentity)) throw new TargetError('identity_mismatch');
          syncDirectory(directory); syncDirectory(area); update('removing');
        }
        if (this.saved(op.operationId)!.state === 'removing') {
          const info = lstatSync(area);
          if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== p.helperUid || (info.mode & 0o777) !== 0o700 ||
            directoryIdentity(area).mountId !== root.identity.mountId) throw new TargetError('identity_mismatch');
          if (!absent(destination)) {
            checkRoot(); writers();
            if (!sameIdentity(directoryIdentity(destination), receipt.directoryIdentity)) throw new TargetError('identity_mismatch');
            // Validate the entire remaining tree before the first unlink.
            walkOwned(destination, receipt.directoryIdentity, p);
            walkOwned(destination, receipt.directoryIdentity, p, true, () => this.dependencies.barrier?.('unlink'));
            rmdirSync(destination); syncDirectory(area); this.dependencies.barrier?.('removed');
          }
          // Only a durable removing phase inside the protected area permits
          // absence to complete deletion. An unrecognized missing source cannot.
          syncDirectory(area); checkRoot();
          const tombstone: CleanupTombstoneV1 = { ...identity, directoryIdentity: receipt.directoryIdentity, deletedAt: new Date().toISOString() };
          validated('cleanup-tombstone', tombstone);
          this.atomic(() => this.db.prepare("UPDATE cleanup_deletions SET state='deleted',tombstone=? WHERE operation_id=?").run(canonical(tombstone), op.operationId));
          this.dependencies.barrier?.('tombstone');
        }
        return reply(this.saved(op.operationId));
      });
    } catch (error) {
      return reply(undefined, [error instanceof TargetError ? error.code : 'deletion_unknown']);
    } finally { if (locked) this.mutex.exec('ROLLBACK'); }
  }
  close(): void { this.db.close(); this.mutex.close(); this.workspaces.close(); }
}
