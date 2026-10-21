import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { LifecycleError } from '../core/lifecycle.ts';

const common = `
  id TEXT PRIMARY KEY NOT NULL CHECK(id = json_extract(payload, '$.id')),
  payload TEXT NOT NULL CHECK(json_valid(payload) AND length(CAST(payload AS BLOB)) <= 262144
    AND json_extract(payload, '$.schemaVersion') = '1.0'),
  revision INTEGER GENERATED ALWAYS AS (json_extract(payload, '$.revision')) STORED
    CHECK(typeof(revision) = 'integer' AND revision BETWEEN 1 AND 9007199254740991)`;
const ref = (name: string, field: string) =>
  `${name} TEXT GENERATED ALWAYS AS (json_extract(payload, '$.${field}')) STORED NOT NULL`;
const state = (states: string) => `state TEXT GENERATED ALWAYS AS (json_extract(payload, '$.state')) STORED
  NOT NULL CHECK(state IN (${states.split(' ').map(s => `'${s}'`).join(',')}))`;

export interface Migration { version: number; sql: string }
// Immutable migration text: future schema changes must append a migration.
export const migrations: readonly Migration[] = [{ version: 1, sql: `
  CREATE TABLE installations (${common});
  CREATE TABLE requests (${common}, ${ref('installation_id', 'installationId')},
    ${ref('provider_id', 'providerId')}, ${ref('issue_id', 'issueId')},
    generation INTEGER GENERATED ALWAYS AS (json_extract(payload, '$.generation')) STORED NOT NULL CHECK(generation > 0),
    FOREIGN KEY(installation_id) REFERENCES installations(id) ON DELETE RESTRICT,
    UNIQUE(installation_id, provider_id, issue_id, generation));
  CREATE TABLE runs (${common}, ${ref('request_id', 'requestId')},
    ${state('queued preparing ready active waiting_human waiting_ci delivering completed failed cancelled outcome_unknown')},
    FOREIGN KEY(request_id) REFERENCES requests(id) ON DELETE RESTRICT, UNIQUE(request_id));
  CREATE TABLE workspaces (${common}, ${ref('run_id', 'runId')},
    ${state('requested creating ready in_use retained cleanup_pending deleting deleted error outcome_unknown')},
    FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE RESTRICT, UNIQUE(id, run_id));
  CREATE UNIQUE INDEX one_live_workspace ON workspaces(run_id) WHERE state != 'deleted';
  CREATE TABLE operations (${common}, ${ref('run_id', 'runId')}, ${ref('workspace_id', 'workspaceId')},
    ${state('prepared claimed running succeeded failed cancelled outcome_unknown')},
    FOREIGN KEY(workspace_id, run_id) REFERENCES workspaces(id, run_id) ON DELETE RESTRICT, UNIQUE(id, run_id));
  CREATE TABLE deployments (${common}, ${ref('run_id', 'runId')}, ${ref('operation_id', 'operationId')},
    ${state('requested running verified failed outcome_unknown')},
    FOREIGN KEY(operation_id, run_id) REFERENCES operations(id, run_id) ON DELETE RESTRICT);
  CREATE TABLE sessions (${common}, ${ref('run_id', 'runId')}, ${ref('workspace_id', 'workspaceId')},
    ${ref('provider_id', 'providerId')}, ${ref('session_id', 'sessionId')},
    ${state('ready busy waiting_human closed failed outcome_unknown')},
    FOREIGN KEY(workspace_id, run_id) REFERENCES workspaces(id, run_id) ON DELETE RESTRICT,
    UNIQUE(provider_id, session_id));
  CREATE TABLE outbox (${common}, ${ref('run_id', 'runId')}, ${ref('operation_id', 'operationId')},
    ${ref('intent_key', 'intentKey')}, FOREIGN KEY(operation_id, run_id) REFERENCES operations(id, run_id) ON DELETE RESTRICT,
    UNIQUE(operation_id), UNIQUE(intent_key));
  CREATE TABLE projections (${common}, ${ref('run_id', 'runId')},
    FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE RESTRICT);
  CREATE TABLE audit (id TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL CHECK(json_valid(payload) AND length(CAST(payload AS BLOB)) <= 262144
      AND json_extract(payload, '$.schemaVersion') = '1.0'),
    entity_kind TEXT GENERATED ALWAYS AS (json_extract(payload, '$.record.kind')) STORED NOT NULL,
    entity_id TEXT GENERATED ALWAYS AS (json_extract(payload, '$.record.id')) STORED NOT NULL);
  CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'immutable_audit'); END;
  CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'immutable_audit'); END;
` }, { version: 2, sql: `
  CREATE UNIQUE INDEX operation_workspace_owner ON operations(id, workspace_id, run_id);
  CREATE TABLE resources (${common}, ${ref('run_id', 'runId')}, ${ref('workspace_id', 'workspaceId')},
    ${ref('created_by_operation', 'createdByOperation')},
    FOREIGN KEY(created_by_operation, workspace_id, run_id) REFERENCES operations(id, workspace_id, run_id) ON DELETE RESTRICT);
  CREATE TABLE evidence (${common}, ${ref('run_id', 'runId')}, ${ref('workspace_id', 'workspaceId')},
    ${ref('operation_id', 'operationId')},
    corrects_id TEXT GENERATED ALWAYS AS (json_extract(payload, '$.correctsId')) STORED,
    FOREIGN KEY(operation_id, workspace_id, run_id) REFERENCES operations(id, workspace_id, run_id) ON DELETE RESTRICT,
    FOREIGN KEY(corrects_id, run_id, workspace_id) REFERENCES evidence(id, run_id, workspace_id) ON DELETE RESTRICT,
    UNIQUE(id, run_id, workspace_id), CHECK(corrects_id IS NULL OR corrects_id != id));
  CREATE TRIGGER resources_no_update BEFORE UPDATE ON resources BEGIN SELECT RAISE(ABORT, 'immutable_resource'); END;
  CREATE TRIGGER resources_no_delete BEFORE DELETE ON resources BEGIN SELECT RAISE(ABORT, 'immutable_resource'); END;
  CREATE TRIGGER evidence_no_update BEFORE UPDATE ON evidence BEGIN SELECT RAISE(ABORT, 'immutable_evidence'); END;
  CREATE TRIGGER evidence_no_delete BEFORE DELETE ON evidence BEGIN SELECT RAISE(ABORT, 'immutable_evidence'); END;
` }];

export function migrate(db: DatabaseSync, steps: readonly Migration[] = migrations): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    const version = Number(db.prepare('PRAGMA user_version').get()!.user_version);
    if (version > steps.length) throw new LifecycleError('unsupported_schema');
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
    if (version > 0 && !exists) throw new LifecycleError('unsupported_schema');
    if (!exists) {
      if (db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get())
        throw new LifecycleError('unsupported_schema');
      db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL)');
    }
    const applied = db.prepare('SELECT version, checksum FROM schema_migrations ORDER BY version').all();
    if (applied.length !== version) throw new LifecycleError('unsupported_schema');
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];
      if (step.version !== index + 1) throw new LifecycleError('migration_failed');
      const checksum = createHash('sha256').update(step.sql).digest('hex');
      if (index < version) {
        if (Number(applied[index].version) !== step.version || applied[index].checksum !== checksum)
          throw new LifecycleError('unsupported_schema');
      } else {
        db.exec(step.sql);
        db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(step.version, checksum);
        db.exec(`PRAGMA user_version=${step.version}`);
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    if (error instanceof LifecycleError) throw error;
    throw new LifecycleError('migration_failed');
  }
}
