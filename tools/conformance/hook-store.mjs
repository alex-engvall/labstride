// Disposable-store fixture: no provider hooks, coordinator, execution queue or approval authority.
import { createHash } from 'node:crypto';
import { validate } from './schema.mjs';

const canonical = value => Array.isArray(value) ? value.map(canonical) :
  value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;

export function openHookStore(db) {
  db.exec('PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS observations (event_id TEXT PRIMARY KEY, digest TEXT NOT NULL, observation_id TEXT NOT NULL, payload TEXT NOT NULL)');
}

export function recordHook(db, observation, enrollment) {
  validate('hook-observation', observation);
  for (const key of ['providerId', 'runId', 'requestGeneration', 'workspaceId', 'sessionId', 'turnId']) {
    if (observation[key] !== enrollment[key]) throw new Error('identity_mismatch');
  }
  const payload = JSON.stringify(canonical(observation));
  const digest = createHash('sha256').update(payload).digest('hex');
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT * FROM observations WHERE event_id = ?').get(observation.eventId);
    if (existing && existing.digest !== digest) throw new Error('conflicting_event');
    const observationId = existing?.observation_id ?? `observation:${createHash('sha256').update(observation.eventId).digest('hex')}`;
    if (!existing) db.prepare('INSERT INTO observations VALUES (?, ?, ?, ?)').run(observation.eventId, digest, observationId, payload);
    const acknowledgement = validate('hook-ack', { schemaVersion: '1.0', eventId: observation.eventId,
      outcome: existing ? 'duplicate' : 'accepted', persistence: 'durable', observationId, error: null });
    db.exec('COMMIT');
    // Only acknowledge after the transaction commits; duplicate keeps the original identity.
    return acknowledgement;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* Preserve the original uncertain error. */ }
    throw error;
  }
}
