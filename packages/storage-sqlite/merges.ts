import { GitHubStore } from './github.ts';
import { enrolledMerge } from '../github-merge/bindings.ts';
import { mergeResource, MergeBlocked } from '../core/merges.ts';
import type { MergeEvidence, MergeRecord, MergeObservation } from '../core/merges.ts';
import { validated } from './validation.ts';
import { canonical, digest } from './execution.ts';

export class MergeStore extends GitHubStore {
  mergeBinding(operationId: string) { return enrolledMerge(this.runConfiguration(this.get('operation', operationId).runId), this.get('operation', operationId).request); }
  mergeRecord(operationId: string): MergeRecord | null {
    const row = this.db.prepare('SELECT payload FROM merge_intents WHERE operation_id=?').get(operationId);
    if (!row) return null;
    const record = validated('merge-record', JSON.parse(String(row.payload)) as MergeRecord), op = this.get('operation', operationId).request;
    const { enrollment, input } = this.mergeBinding(operationId);
    if (record.operationId !== operationId || record.requestDigest !== op.requestDigest || record.pullRequest !== input.pullRequest ||
      record.evidence.head !== input.expectedHead || digest(record.enrollment) !== digest(enrollment)) throw new MergeBlocked('merge_identity_mismatch');
    return record;
  }
  mergeBlocker(operationId: string, code: string): void {
    if (!/^[a-z_]{1,100}$/.test(code)) code = 'merge_blocked';
    this.log(operationId, 'merge_gate_blocked', { schemaVersion: '1.0', code });
  }
  beginMergeIntent(operationId: string, raw: MergeEvidence, expectedEpoch = this.recoveryEpoch()): boolean {
    const evidence = validated('merge-evidence', raw);
    return this.transaction(() => {
      if (this.mergeRecord(operationId)) return false;
      const { enrollment, input } = this.mergeBinding(operationId), operation = this.get('operation', operationId), op = operation.request;
      const key = mergeResource(enrollment);
      const q = evidence.qualification;
      if (!q.qualified || q.blocker !== null || q.repositoryId !== enrollment.repository.id || q.appId !== enrollment.appId ||
        q.installationId !== enrollment.installationId || q.actorId !== enrollment.actorId || q.credentialRef !== enrollment.credentialRef ||
        q.mergeSha !== enrollment.qualification.mergeSha || q.runId !== enrollment.qualification.runId ||
        q.workflowId !== enrollment.downstream.id || q.workflowBlobSha !== enrollment.downstream.blobSha ||
        enrollment.checks.some(required => !evidence.checks.some(check => check.context === required.context && check.appId === required.appId)) ||
        enrollment.workflows.some(required => !evidence.runs.some(run => run.workflowId === required.id && run.blobSha === required.blobSha)))
        throw new MergeBlocked('merge_evidence_identity_mismatch');
      this.assertConfigurationOperation(op.runId, op); this.assertPolicyOperation(op.runId, op); this.assertAutomation(operationId, false);
      const request = this.get('request', this.get('run', op.runId).requestId);
      const latest = this.db.prepare('SELECT max(generation) AS generation FROM requests WHERE installation_id=? AND provider_id=? AND issue_id=?')
        .get(request.installationId, request.providerId, request.issueId);
      if (expectedEpoch !== this.recoveryEpoch() || !this.operationAuthorization(operationId).allowed || !this.forwardAllowed(op.runId) ||
        operation.effectBoundary !== 'crossed' || !['running','outcome_unknown'].includes(operation.state) ||
        Date.parse(op.deadline) <= Date.parse(this.clock.now()) || evidence.head !== input.expectedHead ||
        latest?.generation !== request.generation || this.db.prepare('SELECT paused FROM recovery_control WHERE id=1').get()?.paused ||
        this.db.prepare('SELECT 1 FROM resource_holds WHERE resource_key=?').get(key) ||
        !this.db.prepare('SELECT 1 FROM claims WHERE operation_id=? AND resource_key=? AND active=1 AND consumed=1').get(operationId, key) ||
        this.db.prepare('SELECT 1 FROM merge_intents WHERE resource_key=? AND active=1').get(key)) throw new MergeBlocked('merge_effect_blocked');
      const record: MergeRecord = { schemaVersion: '1.0', operationId, requestDigest: op.requestDigest, enrollment,
        pullRequest: input.pullRequest, evidence, submittedAt: this.clock.now(), responseSha: null, mergeSha: null, outcome: 'pending' };
      this.db.prepare('INSERT INTO merge_intents(operation_id,resource_key,payload) VALUES (?,?,?)').run(operationId, key, canonical(validated('merge-record', record)));
      this.log(operationId, 'merge_intent', { schemaVersion: '1.0', evidence });
      return true;
    });
  }
  recordMergeResponse(operationId: string, response: { merged: boolean; sha: string | null }): void {
    this.transaction(() => {
      const previous = this.mergeRecord(operationId);
      if (!previous || previous.outcome !== 'pending' || typeof response.merged !== 'boolean' ||
        (response.merged && (typeof response.sha !== 'string' || !/^[a-f0-9]{40}$/.test(response.sha))) ||
        (!response.merged && response.sha !== null)) throw new MergeBlocked('merge_response_invalid');
      if (previous.responseSha && previous.responseSha !== response.sha) throw new MergeBlocked('merge_evidence_conflict');
      const record: MergeRecord = { ...previous, responseSha: response.sha, outcome: response.merged ? 'pending' : 'rejected' };
      this.db.prepare('UPDATE merge_intents SET payload=?,active=? WHERE operation_id=?').run(canonical(record), response.merged ? 1 : 0, operationId);
      this.log(operationId, 'merge_response', { schemaVersion: '1.0', merged: response.merged, sha: response.sha });
    });
  }
  recordMergeObservation(operationId: string, observed: MergeObservation, expectedEpoch = this.recoveryEpoch()): MergeRecord {
    return this.transaction(() => {
      if (expectedEpoch !== this.recoveryEpoch()) throw new MergeBlocked('merge_recovery_epoch_changed');
      const previous = this.mergeRecord(operationId); if (!previous) throw new MergeBlocked('merge_intent_missing');
      if (['confirmed','rejected','conflict'].includes(previous.outcome)) return previous;
      const { enrollment: e } = previous;
      const identity = observed.repositoryId === e.repository.nodeId && observed.pullRequest === previous.pullRequest &&
        observed.head === previous.evidence.head && observed.baseBranch === e.baseBranch;
      const sha = typeof observed.mergeSha === 'string' && /^[a-f0-9]{40}$/.test(observed.mergeSha) ? observed.mergeSha : null;
      let outcome: MergeRecord['outcome'] = previous.outcome;
      if (!identity || observed.merged && (!sha || previous.responseSha && sha !== previous.responseSha)) outcome = 'conflict';
      else if (observed.merged) outcome = previous.responseSha === sha && observed.mergedBy === e.actorId ? 'confirmed' : 'observed_external';
      const record = validated('merge-record', { ...previous, mergeSha: observed.merged ? sha : null, outcome });
      this.db.prepare('UPDATE merge_intents SET payload=?,active=? WHERE operation_id=?').run(canonical(record), outcome === 'confirmed' ? 0 : 1, operationId);
      this.log(operationId, 'merge_observed', { schemaVersion: '1.0', outcome, mergeSha: record.mergeSha });
      return record;
    });
  }
}
