import { enrolledWorkflow } from '../workflow-broker/bindings.ts';
import { GitHubStore } from './github.ts';
import { validated } from './validation.ts';
import { canonical, digest } from './execution.ts';
import { BrokerError, workflowResource } from '../core/workflow-broker.ts';
import type { Enrollment, WorkflowClaim, WorkflowDispatch, WorkflowMessage, WorkflowReceipt, WorkflowRun } from '../core/workflow-broker.ts';

// The coordinator's existing claim protects dispatch. This second claim binds
// the external workflow executor; neither claim is inferred from hook progress.
export class WorkflowBrokerStore extends GitHubStore {
  workflowEnrollment(operationId: string): Enrollment {
    const op = this.get('operation', operationId).request;
    return enrolledWorkflow(this.runConfiguration(op.runId), op);
  }
  workflowDispatch(operationId: string): WorkflowDispatch | null {
    const row = this.db.prepare('SELECT payload FROM workflow_dispatches WHERE operation_id=?').get(operationId);
    if (!row) return null;
    const record = validated('workflow-dispatch', JSON.parse(String(row.payload)) as WorkflowDispatch);
    const op = this.get('operation', operationId).request;
    if (record.operationId !== operationId || record.requestDigest !== op.requestDigest ||
      digest(record.enrollment) !== digest(this.workflowEnrollment(operationId))) throw new BrokerError('identity_rejected', 403);
    return record;
  }
  workflowAvailable(operationId: string): boolean {
    const enrollment = this.workflowEnrollment(operationId);
    return !this.db.prepare('SELECT 1 FROM workflow_dispatches WHERE resource_key=? AND active=1 AND operation_id!=?')
      .get(workflowResource(enrollment), operationId);
  }
  protected workflowEffectAllowed(operationId: string): void {
    const operation = this.get('operation', operationId), op = operation.request;
    this.assertConfigurationOperation(op.runId, op);
    this.assertPolicyOperation(op.runId, op);
    this.assertAutomation(operationId, false);
    // No legacy fixture bypass: broker execution always needs a bound policy.
    if (!this.operationAuthorization(operationId).allowed || !this.forwardAllowed(op.runId) ||
      operation.effectBoundary !== 'crossed' || !['running','outcome_unknown'].includes(operation.state) ||
      Date.parse(op.deadline) <= Date.parse(this.clock.now()) ||
      this.db.prepare('SELECT paused FROM recovery_control WHERE id=1').get()?.paused ||
      this.db.prepare('SELECT 1 FROM resource_holds WHERE resource_key=?').get(workflowResource(this.workflowEnrollment(operationId))))
      throw new BrokerError('effect_blocked', 403);
    const run = this.get('run', op.runId), request = this.get('request', run.requestId);
    const latest = this.db.prepare('SELECT max(generation) AS generation FROM requests WHERE installation_id=? AND provider_id=? AND issue_id=?')
      .get(request.installationId, request.providerId, request.issueId);
    if (latest?.generation !== request.generation) throw new BrokerError('effect_blocked', 403);
  }
  beginWorkflowDispatch(operationId: string): { dispatch: boolean; record: WorkflowDispatch } {
    return this.transaction(() => {
      const enrollment = this.workflowEnrollment(operationId), previous = this.workflowDispatch(operationId);
      if (previous) {
        if (digest(previous.enrollment) !== digest(enrollment)) throw new BrokerError('claim_conflict', 409);
        return { dispatch: false, record: previous };
      }
      this.workflowEffectAllowed(operationId);
      if (!this.workflowAvailable(operationId)) throw new BrokerError('claim_conflict', 409);
      const op = this.get('operation', operationId).request;
      const record = validated<WorkflowDispatch>('workflow-dispatch', { schemaVersion: '1.0', operationId,
        requestDigest: op.requestDigest, enrollment, submittedAt: this.clock.now(), runId: null });
      this.db.prepare('INSERT INTO workflow_dispatches(operation_id,payload,resource_key) VALUES (?,?,?)')
        .run(operationId, canonical(record), workflowResource(enrollment));
      this.log(operationId, 'workflow_dispatch_intent', { requestDigest: op.requestDigest, workflowSha: enrollment.workflowSha, sourceSha: op.source.sha });
      return { dispatch: true, record };
    });
  }
  bindWorkflowRun(operationId: string, runId: string): void {
    if (!/^[1-9][0-9]{0,31}$/.test(runId)) throw new BrokerError('invalid_payload', 400);
    const conflict = this.transaction(() => {
      const record = this.workflowDispatch(operationId);
      if (!record) throw new BrokerError('not_found', 404);
      if (record.runId !== null && record.runId !== runId) { this.workflowConflict(operationId); return true; }
      if (record.runId === null) this.db.prepare('UPDATE workflow_dispatches SET payload=? WHERE operation_id=?')
        .run(canonical({ ...record, runId }), operationId);
      return false;
    });
    if (conflict) throw new BrokerError('claim_conflict', 409);
  }
  workflowConflict(operationId: string): void {
    this.transaction(() => {
      this.db.prepare('UPDATE workflow_dispatches SET conflict=1 WHERE operation_id=?').run(operationId);
      const dispatch = this.workflowDispatch(operationId);
      if (dispatch) this.db.prepare('INSERT OR IGNORE INTO resource_holds VALUES (?,?)')
        .run(workflowResource(dispatch.enrollment), 'conflicting_workflow_evidence');
      this.log(operationId, 'workflow_evidence_conflict', { schemaVersion: '1.0' });
    });
  }
  workflowConflicted(operationId: string): boolean {
    return this.db.prepare('SELECT conflict FROM workflow_dispatches WHERE operation_id=?').get(operationId)?.conflict === 1;
  }
  workflowClaim(operationId: string): WorkflowClaim | null {
    const row = this.db.prepare('SELECT payload FROM workflow_claims WHERE operation_id=?').get(operationId);
    return row ? validated('workflow-claim', JSON.parse(String(row.payload)) as WorkflowClaim) : null;
  }
  claimWorkflow(operationId: string, input: WorkflowMessage, executor: WorkflowClaim['executor']): WorkflowClaim {
    const message = validated('workflow-message', input);
    return this.transaction(() => {
      const op = this.get('operation', operationId).request, dispatch = this.workflowDispatch(operationId);
      if (!dispatch || message.claimId !== undefined || message.requestDigest !== op.requestDigest || this.workflowConflicted(operationId)) throw new BrokerError('claim_conflict', 409);
      const enrollment = this.workflowEnrollment(operationId);
      if (executor.repositoryId !== enrollment.repository.id || executor.workflowPath !== enrollment.workflowPath || executor.workflowSha !== enrollment.workflowSha ||
        dispatch.runId !== null && dispatch.runId !== executor.runId) throw new BrokerError('claim_conflict', 409);
      const previous = this.workflowClaim(operationId);
      if (previous) {
        if (canonical(previous.executor) !== canonical(executor)) throw new BrokerError('claim_conflict', 409);
        return previous;
      }
      this.workflowEffectAllowed(operationId);
      const parent = this.db.prepare('SELECT payload FROM claims WHERE operation_id=? AND active=1 AND consumed=1').get(operationId);
      if (!parent) throw new BrokerError('effect_blocked', 403);
      const claim = validated<WorkflowClaim>('workflow-claim', { schemaVersion: '1.0', operationId, requestDigest: op.requestDigest,
        claimId: this.identities.next(), fencingNumber: JSON.parse(String(parent.payload)).fencingNumber, executor });
      this.bindWorkflowRun(operationId, executor.runId);
      this.db.prepare('INSERT INTO workflow_claims(operation_id,payload) VALUES (?,?)').run(operationId, canonical(claim));
      this.log(operationId, 'workflow_claim', claim);
      return claim;
    });
  }
  authorizeWorkflowEffect(operationId: string, input: WorkflowMessage, executor: WorkflowClaim['executor']): WorkflowClaim {
    const message = validated('workflow-message', input);
    this.refreshAutomation(this.get('operation', operationId).runId);
    return this.transaction(() => {
      const claim = this.workflowClaim(operationId);
      if (!claim || message.claimId !== claim.claimId || message.requestDigest !== claim.requestDigest ||
        canonical(executor) !== canonical(claim.executor) || this.workflowConflicted(operationId)) throw new BrokerError('claim_conflict', 409);
      this.workflowEffectAllowed(operationId);
      const changed = this.db.prepare('UPDATE workflow_claims SET consumed=1 WHERE operation_id=? AND consumed=0').run(operationId);
      if (changed.changes !== 1) throw new BrokerError('effect_consumed', 409);
      this.log(operationId, 'workflow_effect_boundary', claim);
      return claim;
    });
  }
  workflowReceipt(operationId: string): WorkflowReceipt | null {
    const row = this.db.prepare('SELECT payload FROM workflow_receipts WHERE operation_id=?').get(operationId);
    return row ? validated('receipt', JSON.parse(String(row.payload)) as WorkflowReceipt) : null;
  }
  acceptWorkflowReceipt(operationId: string, input: WorkflowReceipt, executor: WorkflowClaim['executor']): void {
    const receipt = validated('receipt', input);
    const conflict = this.transaction(() => {
      const claim = this.workflowClaim(operationId), op = this.get('operation', operationId).request;
      if (!claim || receipt.operationId !== operationId || receipt.claimId !== claim.claimId || receipt.fencingNumber !== claim.fencingNumber ||
        receipt.requestDigest !== op.requestDigest || receipt.sourceSha !== op.source.sha || receipt.targetId !== op.targetId ||
        canonical(receipt.executor) !== canonical(executor) || canonical(executor) !== canonical(claim.executor) ||
        this.db.prepare('SELECT consumed FROM workflow_claims WHERE operation_id=?').get(operationId)?.consumed !== 1) throw new BrokerError('identity_rejected', 403);
      const previous = this.workflowReceipt(operationId);
      if (previous && canonical(previous) !== canonical(receipt)) { this.workflowConflict(operationId); return true; }
      if (!previous) {
        this.db.prepare('INSERT INTO workflow_receipts VALUES (?,?)').run(operationId, canonical(receipt));
        this.log(operationId, 'workflow_receipt', { digest: digest(receipt), conclusion: receipt.conclusion });
      }
      return false;
    });
    if (conflict) throw new BrokerError('receipt_conflict', 409);
  }
  finishWorkflowObservation(operationId: string, run: WorkflowRun): WorkflowReceipt | null {
    return this.transaction(() => {
      const claim = this.workflowClaim(operationId), receipt = this.workflowReceipt(operationId);
      const expected = { succeeded: 'success', failed: 'failure', cancelled: 'cancelled', outcome_unknown: null };
      if (!claim || !receipt || this.workflowConflicted(operationId) || run.runId !== claim.executor.runId || run.runAttempt !== claim.executor.runAttempt ||
        run.status !== 'completed' || receipt.conclusion === 'outcome_unknown') return null;
      if (run.conclusion !== expected[receipt.conclusion]) { this.workflowConflict(operationId); return null; }
      this.db.prepare('UPDATE workflow_dispatches SET active=0 WHERE operation_id=?').run(operationId);
      return receipt;
    });
  }
  brokerDenied(operationId: string, code: string): void {
    // Only safe codes and known operation IDs enter the audit, never tokens/bodies.
    if (this.db.prepare('SELECT 1 FROM workflow_dispatches WHERE operation_id=?').get(operationId))
      this.log(operationId, 'workflow_request_denied', { code });
  }
  workflowExecutions(runId: string) {
    this.get('run', runId);
    return this.db.prepare('SELECT d.operation_id,d.conflict,c.consumed FROM workflow_dispatches d JOIN operations o ON o.id=d.operation_id LEFT JOIN workflow_claims c ON c.operation_id=d.operation_id WHERE o.run_id=?')
      .all(runId).map(row => {
        const id = String(row.operation_id), dispatch = this.workflowDispatch(id)!;
        return { operationId: id, sourceSha: this.get('operation', id).request.source.sha, workflowSha: dispatch.enrollment.workflowSha,
          workflowRunId: dispatch.runId, claim: this.workflowClaim(id), effectConsumed: row.consumed === 1,
          receiptConclusion: this.workflowReceipt(id)?.conclusion ?? null, conflict: row.conflict === 1, deploymentVerified: false };
      });
  }
}
