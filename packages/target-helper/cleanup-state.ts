import type { DatabaseSync } from 'node:sqlite';
import { TargetError } from './filesystem.ts';

// Lives in target.sqlite, outside every coding-writable directory. The same
// transaction excludes attachment and deletion, including across helper processes.
export function createCleanupTables(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS cleanup_deletions (
    operation_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, request TEXT NOT NULL CHECK(json_valid(request)),
    receipt TEXT NOT NULL CHECK(json_valid(receipt)), state TEXT NOT NULL,
    preparation TEXT CHECK(preparation IS NULL OR json_valid(preparation)),
    tombstone TEXT CHECK(tombstone IS NULL OR json_valid(tombstone)), area_identity TEXT CHECK(area_identity IS NULL OR json_valid(area_identity)), blockers TEXT NOT NULL DEFAULT '[]');
    CREATE UNIQUE INDEX IF NOT EXISTS cleanup_workspace_owner ON cleanup_deletions(workspace_id) WHERE state NOT IN ('blocked','released');
    CREATE TRIGGER IF NOT EXISTS cleanup_identity_immutable BEFORE UPDATE OF operation_id,workspace_id,request,receipt ON cleanup_deletions BEGIN SELECT RAISE(ABORT,'immutable_cleanup'); END;
    CREATE TRIGGER IF NOT EXISTS cleanup_preparation_immutable BEFORE UPDATE OF preparation ON cleanup_deletions WHEN OLD.preparation IS NOT NULL BEGIN SELECT RAISE(ABORT,'immutable_preparation'); END;
    CREATE TRIGGER IF NOT EXISTS cleanup_tombstone_immutable BEFORE UPDATE ON cleanup_deletions WHEN OLD.tombstone IS NOT NULL BEGIN SELECT RAISE(ABORT,'immutable_tombstone'); END;
    CREATE TRIGGER IF NOT EXISTS cleanup_retained BEFORE DELETE ON cleanup_deletions BEGIN SELECT RAISE(ABORT,'immutable_cleanup'); END;
    CREATE TABLE IF NOT EXISTS workspace_uses (operation_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)));`);
}
export function assertWorkspaceAvailable(db: DatabaseSync, workspaceId: string): void {
  if (db.prepare("SELECT 1 FROM cleanup_deletions WHERE workspace_id=? AND state NOT IN ('blocked','released')").get(workspaceId)) throw new TargetError('resource_busy');
}
