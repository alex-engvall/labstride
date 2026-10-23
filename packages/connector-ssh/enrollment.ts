import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { chmodSync } from 'node:fs';
import { validated } from '../storage-sqlite/validation.ts';
import { digest } from '../storage-sqlite/execution.ts';
import { assertPrivateDatabase, protectedPath, readProtected, TargetError } from '../target-helper/filesystem.ts';
import type { SSHTargetEnrollmentV1 } from '../../contracts/generated/ssh-enrollment.ts';
export type Enrollment = SSHTargetEnrollmentV1;
export interface ConnectorConfiguration { enrollmentDirectory: string; targetId: string; revision: number; digest: string }
export interface EnrollmentAudit { actorId: string; reason: string }

// Local operator API. OS ownership of this directory is the authority boundary;
// neither remote payloads nor hook/issue fields can invoke an enrollment change.
export class EnrollmentStore {
  private db: DatabaseSync;
  readonly directory: string;
  constructor(directory: string) {
    this.directory = directory;
    assertPrivateDatabase(directory, 'enrollments.sqlite');
    const path = join(directory, 'enrollments.sqlite');
    this.db = new DatabaseSync(path, { timeout: 5000 });
    const version = this.db.prepare('PRAGMA user_version').get()!.user_version;
    if (version !== 0 && version !== 1) { this.db.close(); throw new TargetError('configuration_invalid'); }
    if (version === 0 && this.db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get()) {
      this.db.close(); throw new TargetError('configuration_invalid');
    }
    if (version === 1 && this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
      .map(row => row.name).join(',') !== 'current_enrollments,enrollment_audit,enrollments') { this.db.close(); throw new TargetError('configuration_invalid'); }
    chmodSync(path, 0o600); this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON');
    this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS enrollments (target_id TEXT NOT NULL, revision INTEGER NOT NULL,
        digest TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)), PRIMARY KEY(target_id,revision));
      CREATE TABLE IF NOT EXISTS current_enrollments (target_id TEXT PRIMARY KEY, revision INTEGER NOT NULL,
        FOREIGN KEY(target_id,revision) REFERENCES enrollments(target_id,revision));
      CREATE TABLE IF NOT EXISTS enrollment_audit (id INTEGER PRIMARY KEY, target_id TEXT NOT NULL, revision INTEGER NOT NULL,
        actor_id TEXT NOT NULL, reason TEXT NOT NULL, at TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS enrollment_immutable BEFORE UPDATE ON enrollments BEGIN SELECT RAISE(ABORT,'immutable'); END;
      CREATE TRIGGER IF NOT EXISTS enrollment_retained BEFORE DELETE ON enrollments BEGIN SELECT RAISE(ABORT,'immutable'); END;
      CREATE TRIGGER IF NOT EXISTS audit_immutable BEFORE UPDATE ON enrollment_audit BEGIN SELECT RAISE(ABORT,'immutable'); END;
      CREATE TRIGGER IF NOT EXISTS audit_retained BEFORE DELETE ON enrollment_audit BEGIN SELECT RAISE(ABORT,'immutable'); END;
      PRAGMA user_version=1; COMMIT;`);
  }
  publish(value: Enrollment, expectedRevision: number, audit: EnrollmentAudit): ConnectorConfiguration {
    const enrollment = validated('ssh-enrollment', value);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || enrollment.revision !== expectedRevision + 1 ||
      !audit.actorId || !audit.reason || audit.actorId.length > 256 || audit.reason.length > 1024)
      throw new TargetError('validation_failed');
    protectedPath(enrollment.identityFile, false); readProtected(enrollment.identityFile);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.db.prepare('SELECT revision FROM current_enrollments WHERE target_id=?').get(enrollment.targetId);
      if ((current?.revision ?? 0) !== expectedRevision) throw new TargetError('identity_mismatch');
      const hash = digest(enrollment);
      this.db.prepare('INSERT INTO enrollments VALUES (?,?,?,?)').run(enrollment.targetId, enrollment.revision, hash, JSON.stringify(enrollment));
      this.db.prepare('INSERT INTO current_enrollments VALUES (?,?) ON CONFLICT(target_id) DO UPDATE SET revision=excluded.revision')
        .run(enrollment.targetId, enrollment.revision);
      this.db.prepare('INSERT INTO enrollment_audit(target_id,revision,actor_id,reason,at) VALUES (?,?,?,?,?)')
        .run(enrollment.targetId, enrollment.revision, audit.actorId, audit.reason, new Date().toISOString());
      this.db.exec('COMMIT');
      return { enrollmentDirectory: this.directory, targetId: enrollment.targetId, revision: enrollment.revision, digest: hash };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  history(targetId: string) { return this.db.prepare('SELECT revision,actor_id,reason,at FROM enrollment_audit WHERE target_id=? ORDER BY revision').all(targetId); }
  close() { this.db.close(); }
}
