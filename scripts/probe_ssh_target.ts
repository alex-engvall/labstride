// Explicit, bounded operator probe. The reservation is retained for recovery;
// this tool never creates a source checkout, approves work or performs cleanup.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readProtected, assertPrivateDatabase } from '../packages/target-helper/filesystem.ts';
import { targetResolver } from '../packages/connector-ssh/runtime.ts';
import { freezeProfile } from '../packages/extensions/loader.ts';
import { requestDigest } from '../packages/storage-sqlite/execution.ts';
import { validated } from '../packages/storage-sqlite/validation.ts';
import type { ConnectorConfiguration } from '../packages/connector-ssh/enrollment.ts';
import type { HelperRequest } from '../packages/target-helper/registry.ts';
process.umask(0o077);
try {
  if (process.argv.length !== 3) throw new Error();
  const spec = JSON.parse(readProtected(process.argv[2]).toString('utf8')) as {
    configuration: ConnectorConfiguration; artifactPath: string; installationId: string;
    rootId: string; operation: import('../packages/core/lifecycle.ts').RecordOf<'operation'>['request'];
  };
  const bytes = readFileSync(spec.artifactPath), integrity = createHash('sha256').update(bytes).digest('hex');
  const host = { protocol: { major: 1, minor: 0 }, capabilities: [], permissions: ['network.ssh'] };
  const pin = { id: 'labstride.connector.ssh', version: JSON.parse(readFileSync(spec.artifactPath, 'utf8')).manifest.version, kind: 'connector' as const, artifactPath: spec.artifactPath,
    integrity, configuration: { ...spec.configuration }, permissions: ['network.ssh'], capabilities: ['target.probe.v1','target.reserve.v1','target.inspect.v1'] };
  const operation = validated('operation', spec.operation);
  if (operation.requestDigest !== requestDigest(operation) || operation.targetId !== spec.configuration.targetId) throw new Error();
  const connector = await targetResolver(host).resolve(freezeProfile(operation.runId, operation.configDigest, pin, host));
  const base = { schemaVersion: '1.0' as const, installationId: spec.installationId, targetId: spec.configuration.targetId,
    targetRevision: spec.configuration.revision };
  const before = await connector.invoke({ ...base, requestId: randomUUID(), method: 'probe' });
  if (before.outcome !== 'ok') throw new Error();
  const request: HelperRequest = { ...base, requestId: operation.operationId, method: 'reserve', operation };
  // Inspect first: rerunning a probe must never replay a possibly completed effect.
  let reply = await connector.invoke({ ...request, method: 'inspect' });
  if (reply.outcome === 'outcome_unknown') {
    // This is a deliberately new operator-owned probe operation, whose first
    // dispatch is guarded by an exclusive durable local intent below.
    const { DatabaseSync } = await import('node:sqlite');
    const { join } = await import('node:path');
    assertPrivateDatabase(spec.configuration.enrollmentDirectory, 'probe-intents.sqlite');
    const db = new DatabaseSync(join(spec.configuration.enrollmentDirectory, 'probe-intents.sqlite'));
    try {
      db.exec('PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS intents (id TEXT PRIMARY KEY, digest TEXT NOT NULL)');
      const row = db.prepare('INSERT OR IGNORE INTO intents VALUES (?,?)').run(operation.operationId, operation.requestDigest);
      if (!row.changes) throw new Error('outcome_unknown');
      reply = await connector.invoke(request);
    } finally { db.close(); }
  }
  if (reply.outcome !== 'ok') throw new Error();
  const observed = await connector.invoke({ ...request, method: 'inspect' });
  if (observed.outcome !== 'ok' || JSON.stringify(observed.reservation) !== JSON.stringify(reply.reservation)) throw new Error();
  console.log(JSON.stringify({ schemaVersion: '1.0', outcome: 'ok', connectorDigest: integrity,
    operationDigest: operation.requestDigest, reservationState: observed.reservation!.state,
    originalIdentityRetained: true, capabilities: before.capabilities }));
} catch { process.stderr.write('target_probe_failed_or_unknown\n'); process.exitCode = 1; }
