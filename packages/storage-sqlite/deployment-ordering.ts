import { MergeStore } from './merges.ts';
import { validated } from './validation.ts';
import { canonical, digest } from './execution.ts';
import { enrolledWorkflow } from '../workflow-broker/bindings.ts';
import { BrokerError, workflowAction, workflowVersion, workflowResource } from '../core/workflow-broker.ts';
import { deploymentId, targetVerdict } from '../core/deployments.ts';
import type { DeploymentEvidence, TargetObservation, TargetObservationRequest } from '../core/deployments.ts';
import type { BoundResult, Claim } from '../core/execution.ts';
import type { RecordOf } from '../core/lifecycle.ts';
import type { DeploymentOrderV1 } from '../../contracts/generated/deployment-order.ts';
import type { DeploymentOrderCheckV1 } from '../../contracts/generated/deployment-order-check.ts';
import type { DeploymentSuccessorEvidenceV1 } from '../../contracts/generated/deployment-successor-evidence.ts';
import type { RevisionComparisonV1 } from '../../contracts/generated/revision-comparison.ts';

export type OrderContext = ReturnType<DeploymentOrderingStore['deploymentOrderContext']>;
const denied = () => new BrokerError('effect_blocked', 403);

export class DeploymentOrderingStore extends MergeStore {
  protected override enqueue(kind: 'operation' | 'projection', id: string): void {
    super.enqueue(kind, id);
    if (kind !== 'operation') return;
    const op = this.get('operation', id).request;
    if (op.actionId !== workflowAction || op.actionVersion !== workflowVersion) return;
    const enrollment = enrolledWorkflow(this.runConfiguration(op.runId), op);
    if (!enrollment.deployment) return;
    const resourceKey = workflowResource(enrollment);
    // This hook runs inside the operation-creation transaction, never at dispatch.
    this.db.prepare('INSERT OR IGNORE INTO deployment_targets(resource_key) VALUES (?)').run(resourceKey);
    const predecessor = this.db.prepare('SELECT operation_id FROM deployment_targets WHERE resource_key=?').get(resourceKey)!;
    const inserted = this.db.prepare("INSERT INTO deployment_orders(operation_id,resource_key,payload) VALUES (?,?,'{}')").run(id, resourceKey);
    const order = validated<DeploymentOrderV1>('deployment-order', { schemaVersion: '1.0', operationId: id,
      requestDigest: op.requestDigest, sequence: Number(inserted.lastInsertRowid), resourceKey, sourceRepositoryId: op.source.repositoryId,
      sourceSha: op.source.sha, expectedPredecessor: predecessor.operation_id as string | null });
    this.db.prepare('UPDATE deployment_orders SET payload=? WHERE operation_id=?').run(canonical(order), id);
    const now = this.clock.now();
    this.write([{ expectedRevision: null, record: { schemaVersion: '1.0', kind: 'deployment', id: deploymentId(id), revision: 1,
      createdAt: now, updatedAt: now, runId: op.runId, operationId: id, targetId: op.targetId, sourceSha: op.source.sha, state: 'requested' } }],
    { actorId: 'coordinator', reason: 'Queued deployment identity and predecessor', evidenceRefs: [`operation:${id}`] });
    this.log(id, 'deployment_queued', order);
  }

  deploymentOrder(operationId: string): DeploymentOrderV1 | null {
    const row = this.db.prepare('SELECT sequence,resource_key,payload FROM deployment_orders WHERE operation_id=?').get(operationId);
    if (!row) return null;
    const order = validated<DeploymentOrderV1>('deployment-order', JSON.parse(String(row.payload)));
    const op = this.get('operation', operationId).request;
    const enrollment = enrolledWorkflow(this.runConfiguration(op.runId), op);
    if (order.sequence !== row.sequence || order.resourceKey !== row.resource_key || order.operationId !== operationId || order.requestDigest !== op.requestDigest || order.sourceSha !== op.source.sha ||
      order.sourceRepositoryId !== op.source.repositoryId || order.resourceKey !== workflowResource(enrollment)) throw denied();
    return order;
  }

  deploymentOrderContext(operationId: string) {
    const order = this.deploymentOrder(operationId);
    if (!order) throw denied(); // Legacy operations receive no invented queue position.
    const row = this.db.prepare('SELECT * FROM deployment_targets WHERE resource_key=?').get(order.resourceKey)!;
    let current: { operationId: string; evidenceId: string; sequence: number; evidence: DeploymentEvidence } | null = null;
    if (row.operation_id !== null) {
      const evidenceRow = this.db.prepare('SELECT payload FROM deployment_evidence WHERE id=? AND operation_id=?').get(row.evidence_id, row.operation_id);
      if (!evidenceRow) throw denied();
      const evidence = validated<DeploymentEvidence>('deployment-evidence', JSON.parse(String(evidenceRow.payload)));
      const previous = this.deploymentOrder(String(row.operation_id));
      if (!previous || previous.resourceKey !== order.resourceKey || digest(evidence) !== row.evidence_id || evidence.status !== 'verified' ||
        evidence.operationId !== previous.operationId || evidence.sourceSha !== previous.sourceSha || evidence.sourceRepositoryId !== previous.sourceRepositoryId ||
        this.get('deployment', deploymentId(previous.operationId)).state !== 'verified') throw denied();
      current = { operationId: previous.operationId, evidenceId: String(row.evidence_id), sequence: previous.sequence, evidence };
    }
    return { order, current, targetRevision: Number(row.revision), legacyBlocked: row.legacy_blocked === 1, recoveryEpoch: this.recoveryEpoch() };
  }

  protected sameOrderContext(context: OrderContext): void {
    const actual = this.deploymentOrderContext(context.order.operationId);
    if (canonical(actual) !== canonical(context)) throw denied();
  }
  protected targetBusy(resourceKey: string, ownOperation?: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM resource_holds WHERE resource_key=?').get(resourceKey) ||
      !!this.db.prepare('SELECT 1 FROM workflow_dispatches WHERE resource_key=? AND active=1 AND operation_id!=?').get(resourceKey, ownOperation ?? '') ||
      !!this.db.prepare('SELECT 1 FROM claims WHERE resource_key=? AND active=1 AND operation_id!=?').get(resourceKey, ownOperation ?? '') ||
      this.db.prepare('SELECT paused FROM recovery_control WHERE id=1').get()?.paused === 1;
  }
  recordOrderCheck(context: OrderContext, raw: RevisionComparisonV1 | null) {
    return this.transaction(() => {
      this.sameOrderContext(context);
      const { order, current } = context;
      let comparison = raw === null ? null : validated('revision-comparison', raw);
      const op = this.get('operation', order.operationId).request;
      if (comparison && (!current || comparison.repositoryId !== op.source.repositoryId || current.evidence.sourceRepositoryId !== op.source.repositoryId ||
        comparison.baseSha !== current.evidence.sourceSha || comparison.headSha !== op.source.sha)) comparison = null;
      let decision: DeploymentOrderCheckV1['decision'] = 'allow', blocker: DeploymentOrderCheckV1['blocker'] = 'none';
      if (context.legacyBlocked) { decision = 'blocked'; blocker = 'legacy_order_unknown'; }
      else if (this.targetBusy(order.resourceKey, order.operationId)) { decision = 'blocked'; blocker = 'target_busy'; }
      else if (current) {
        if (!comparison) { decision = 'blocked'; blocker = 'comparison_unavailable'; }
        else if (comparison.relation === 'diverged') { decision = 'blocked'; blocker = 'revision_diverged'; }
        else if (order.sequence < current.sequence) { decision = 'supersede'; blocker = 'older_queued_revision'; }
        else if (comparison.relation !== 'ahead') { decision = 'supersede'; blocker = 'revision_already_delivered'; }
      }
      const check = validated<DeploymentOrderCheckV1>('deployment-order-check', { schemaVersion: '1.0', operationId: order.operationId,
        requestDigest: op.requestDigest, sequence: order.sequence, resourceKey: order.resourceKey,
        predecessorOperationId: current?.operationId ?? null, predecessorEvidenceId: current?.evidenceId ?? null,
        targetRevision: context.targetRevision, recoveryEpoch: context.recoveryEpoch, comparison, decision, blocker, observedAt: this.clock.now() });
      const id = digest(check);
      this.db.prepare('INSERT OR IGNORE INTO deployment_order_checks VALUES (?,?,?)').run(id, order.operationId, canonical(check));
      this.log(order.operationId, 'deployment_order_checked', { evidenceId: id, decision, blocker });
      return { id, check };
    });
  }
  orderCheck(operationId: string, id?: string): { id: string; check: DeploymentOrderCheckV1 } | null {
    const row = id === undefined ? this.db.prepare('SELECT id,payload FROM deployment_order_checks WHERE operation_id=? ORDER BY rowid DESC LIMIT 1').get(operationId)
      : this.db.prepare('SELECT id,payload FROM deployment_order_checks WHERE operation_id=? AND id=?').get(operationId, id);
    if (!row) return null;
    const check = validated<DeploymentOrderCheckV1>('deployment-order-check', JSON.parse(String(row.payload)));
    if (check.operationId !== operationId || digest(check) !== row.id) throw denied();
    return { id: String(row.id), check };
  }
  protected checkCurrentOrder(check: DeploymentOrderCheckV1, decision: 'allow' | 'supersede'): void {
    const context = this.deploymentOrderContext(check.operationId);
    if (check.decision !== decision || context.legacyBlocked || context.targetRevision !== check.targetRevision || context.recoveryEpoch !== check.recoveryEpoch ||
      (context.current?.operationId ?? null) !== check.predecessorOperationId || (context.current?.evidenceId ?? null) !== check.predecessorEvidenceId ||
      context.order.requestDigest !== check.requestDigest || context.order.sequence !== check.sequence ||
      this.targetBusy(context.order.resourceKey, check.operationId)) throw denied();
  }
  protected assertDeploymentOrder(operationId: string): void {
    const saved = this.orderCheck(operationId);
    if (!saved) throw denied();
    this.checkCurrentOrder(saved.check, 'allow');
  }
  protected finalizeDeploymentPointer(operationId: string, evidenceId: string): void {
    // Historical dispatches can still be observed, but do not acquire ordering proof.
    const order = this.deploymentOrder(operationId);
    if (!order) return;
    this.assertDeploymentOrder(operationId);
    this.db.prepare('UPDATE deployment_targets SET operation_id=?,evidence_id=?,revision=revision+1 WHERE resource_key=?')
      .run(operationId, evidenceId, order.resourceKey);
  }

  supersededResult(operationId: string): BoundResult {
    const row = this.db.prepare('SELECT payload FROM execution_results WHERE operation_id=?').get(operationId);
    if (!row) throw denied();
    const result = this.validateResult(JSON.parse(String(row.payload)));
    if (result.result.status !== 'superseded') throw denied();
    return result;
  }
  protected acceptSuperseded(bound: BoundResult, claim: Claim | null, expectedRevision: number, epoch: number): boolean {
    return this.transaction(() => {
      const op = this.get('operation', bound.operationId);
      if (bound.requestDigest !== op.request.requestDigest || bound.result.status !== 'superseded' ||
        this.db.prepare('SELECT 1 FROM workflow_dispatches WHERE operation_id=?').get(op.id)) throw denied();
      if (op.state === 'superseded') {
        if (canonical(bound) !== canonical(this.supersededResult(op.id))) throw denied();
        return true;
      }
      const proofId = bound.result.outputs.orderEvidenceId;
      const proof = typeof proofId === 'string' ? this.orderCheck(op.id, proofId) : null;
      if (!proof || bound.result.outputs.deploymentVerified !== false || bound.result.resources.length || bound.result.error !== null ||
        !bound.result.evidenceRefs.includes(`deployment-order:${proof.id}`)) throw denied();
      this.checkCurrentOrder(proof.check, 'supersede');
      if (claim) { if (claim.operationId !== op.id || !this.checkClaim(claim).consumed) throw denied(); }
      else if (op.revision !== expectedRevision || epoch !== this.recoveryEpoch() || op.state !== 'outcome_unknown') throw denied();
      this.changeOperation(op.id, 'superseded', false, bound.result.evidenceRefs);
      const deployment = this.get('deployment', deploymentId(op.id));
      if (deployment.state !== 'requested') throw denied();
      this.write([{ record: { ...deployment, state: 'superseded', revision: deployment.revision + 1, updatedAt: this.clock.now() }, expectedRevision: deployment.revision }],
        { actorId: 'coordinator', reason: 'Superseded before workflow dispatch', evidenceRefs: bound.result.evidenceRefs });
      this.db.prepare('INSERT INTO execution_results VALUES (?,?)').run(op.id, canonical(bound));
      this.db.prepare('UPDATE claims SET active=0 WHERE operation_id=?').run(op.id);
      // Continue read-only successor reconciliation without retaining an effect lock.
      this.db.prepare("UPDATE deliveries SET state='reconcile',last_error='successor_proof_pending',revision=revision+1 WHERE operation_id=?").run(op.id);
      this.db.prepare('UPDATE restore_checks SET resolved=1 WHERE operation_id=?').run(op.id);
      this.log(op.id, 'deployment_superseded', { orderEvidenceId: proof.id });
      return true;
    });
  }

  confirmedDeploymentMerge(operationId: string) {
    const op = this.get('operation', operationId).request;
    const rows = this.db.prepare("SELECT id FROM operations WHERE run_id=? AND state='succeeded' AND json_extract(payload,'$.request.actionId')='labstride.github-merge' ORDER BY rowid DESC").all(op.runId);
    for (const row of rows) {
      const merge = this.mergeRecord(String(row.id));
      if (merge?.outcome === 'confirmed' && merge.mergeSha === op.source.sha && merge.enrollment.repository.nodeId === op.source.repositoryId &&
        merge.enrollment.repository.name === op.source.repository) return { operationId: String(row.id), merge };
    }
    return null;
  }
  recordSuccessorEvidence(context: OrderContext, mergeOperationId: string, raw: RevisionComparisonV1,
    request: TargetObservationRequest, target: TargetObservation): string {
    return this.transaction(() => {
      this.sameOrderContext(context);
      const { order, current } = context, op = this.get('operation', order.operationId);
      const merge = this.confirmedDeploymentMerge(op.id), comparison = validated('revision-comparison', raw);
      if (op.state !== 'superseded' || !current || !merge || merge.operationId !== mergeOperationId || context.legacyBlocked ||
        this.targetBusy(order.resourceKey) || this.db.prepare('SELECT conflict FROM workflow_dispatches WHERE operation_id=?').get(current.operationId)?.conflict !== 0 ||
        current.evidence.sourceRepositoryId !== order.sourceRepositoryId || comparison.repositoryId !== order.sourceRepositoryId ||
        comparison.baseSha !== merge.merge.mergeSha || comparison.headSha !== current.evidence.sourceSha ||
        !['ahead','identical'].includes(comparison.relation)) throw denied();
      const successorOp = this.get('operation', current.operationId).request;
      const enrollment = enrolledWorkflow(this.runConfiguration(successorOp.runId), successorOp), profile = enrollment.deployment!;
      if (request.targetId !== successorOp.targetId || request.environment !== enrollment.environment ||
        digest(request.configuration) !== digest(profile.observer.configuration) || target.resourceId !== current.evidence.target?.resourceId ||
        targetVerdict(request, target, profile, successorOp.source, this.clock.now()).status !== 'verified') throw denied();
      const evidence = validated<DeploymentSuccessorEvidenceV1>('deployment-successor-evidence', { schemaVersion: '1.0', operationId: op.id,
        requestDigest: op.request.requestDigest, successorOperationId: current.operationId, successorEvidenceId: current.evidenceId,
        targetRevision: context.targetRevision, mergeOperationId, mergeRecordDigest: digest(merge.merge), mergeSha: merge.merge.mergeSha!,
        comparison, probeRequest: request, target, observedAt: this.clock.now(), recoveryEpoch: context.recoveryEpoch });
      const id = digest(evidence);
      this.db.prepare('INSERT OR IGNORE INTO deployment_successors VALUES (?,?,?)').run(id, op.id, canonical(evidence));
      this.log(op.id, 'deployment_successor_fulfilled', { evidenceId: id, successorOperationId: current.operationId });
      return id;
    });
  }
  successorEvidence(operationId: string, id?: string): { id: string; evidence: DeploymentSuccessorEvidenceV1 } | null {
    const row = id === undefined ? this.db.prepare('SELECT id,payload FROM deployment_successors WHERE operation_id=? ORDER BY rowid DESC LIMIT 1').get(operationId)
      : this.db.prepare('SELECT id,payload FROM deployment_successors WHERE operation_id=? AND id=?').get(operationId, id);
    if (!row) return null;
    const evidence = validated<DeploymentSuccessorEvidenceV1>('deployment-successor-evidence', JSON.parse(String(row.payload)));
    if (digest(evidence) !== row.id || evidence.operationId !== operationId) throw denied();
    return { id: String(row.id), evidence };
  }
  override successorSatisfied(operationId: string): boolean {
    const row = this.db.prepare('SELECT evidence_id FROM deployment_successor_uses WHERE operation_id=?').get(operationId);
    if (!row || this.get('operation', operationId).state !== 'superseded') return false;
    const saved = this.successorEvidence(operationId, String(row.evidence_id));
    return saved !== null && saved.evidence.requestDigest === this.get('operation', operationId).request.requestDigest;
  }
  override consumeSuccessorEvidence(operationId: string): boolean {
    return this.transaction(() => {
      if (this.successorSatisfied(operationId)) return true;
      if (!this.successorFulfilled(operationId)) return false;
      const saved = this.successorEvidence(operationId)!;
      this.db.prepare('INSERT INTO deployment_successor_uses VALUES (?,?)').run(operationId, saved.id);
      this.db.prepare("UPDATE deliveries SET state='done',last_error=NULL,revision=revision+1 WHERE operation_id=? AND state!='conflict'").run(operationId);
      this.log(operationId, 'deployment_successor_used', { evidenceId: saved.id });
      return true;
    });
  }
  override successorFulfilled(operationId: string): boolean {
    try {
      const context = this.deploymentOrderContext(operationId), saved = this.successorEvidence(operationId), current = context.current;
      if (!saved || !current || context.legacyBlocked || this.targetBusy(context.order.resourceKey) ||
        saved.evidence.recoveryEpoch !== context.recoveryEpoch || saved.evidence.targetRevision !== context.targetRevision ||
        saved.evidence.successorOperationId !== current.operationId || saved.evidence.successorEvidenceId !== current.evidenceId ||
        this.db.prepare('SELECT conflict FROM workflow_dispatches WHERE operation_id=?').get(current.operationId)?.conflict !== 0) return false;
      const merge = this.confirmedDeploymentMerge(operationId), op = this.get('operation', current.operationId).request;
      const profile = enrolledWorkflow(this.runConfiguration(op.runId), op).deployment!;
      return !!merge && merge.operationId === saved.evidence.mergeOperationId && digest(merge.merge) === saved.evidence.mergeRecordDigest &&
        targetVerdict(saved.evidence.probeRequest, saved.evidence.target, profile, op.source, this.clock.now()).status === 'verified';
    } catch { return false; }
  }
}
