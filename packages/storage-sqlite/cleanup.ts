import { WorkflowStore } from './workflows.ts';
import { controlContext } from './scheduling.ts';
import { validated } from './validation.ts';
import { digest, canonical, requestDigest } from './execution.ts';
import { LifecycleError } from '../core/lifecycle.ts';
import type { AuditContext, RecordOf } from '../core/lifecycle.ts';
import type { LocalPolicyAuthority } from '../core/policy.ts';
import type { CleanupPolicyV1 } from '../../contracts/generated/cleanup-policy.ts';
import type { CleanupDecisionV1 } from '../../contracts/generated/cleanup-decision.ts';
import type { BoundResult } from '../core/execution.ts';
import { workflowAction, workflowResource } from '../core/workflow-broker.ts';
import { deploymentId } from '../core/deployments.ts';

export class CleanupStore extends WorkflowStore {
  cleanupNow(): string { return this.clock.now(); }
  setWorkspaceKeep(workspaceId: string, keep: boolean, expectedRevision: number, authority: LocalPolicyAuthority, audit: AuditContext): void {
    this.assertOperator(authority); const context = controlContext(audit);
    if (typeof keep !== 'boolean') throw new LifecycleError('invalid_payload');
    this.transaction(() => {
      const workspace = this.get('workspace', workspaceId);
      if (workspace.revision !== expectedRevision || ['deleting', 'deleted'].includes(workspace.state)) throw new LifecycleError('revision_conflict');
      this.write([{ expectedRevision, record: { ...workspace, keep, revision: expectedRevision + 1, updatedAt: this.clock.now() } }], context);
    });
  }
  requestCleanup(runId: string, id: string, authority: LocalPolicyAuthority, audit: AuditContext): string {
    this.assertOperator(authority); const context=controlContext(audit);
    return this.enqueueCleanup(runId, id, 'operator_request',context);
  }
  private enqueueCleanup(runId: string, id: string, trigger: CleanupPolicyV1['trigger'], audit?:AuditContext): string {
    if (!/^[A-Za-z0-9_.:-]{1,256}$/.test(id)) throw new LifecycleError('invalid_payload');
    return this.transaction(() => {
      const policy = this.runConfiguration(runId)?.configuration.cleanup, workspace = this.workspace(runId);
      if (!policy || trigger !== policy.trigger) throw new LifecycleError('effect_blocked');
      const old = this.db.prepare('SELECT * FROM cleanup_requests WHERE id=?').get(id);
      if (old && (old.run_id !== runId || old.workspace_id !== workspace.id || old.trigger !== trigger)) throw new LifecycleError('identity_conflict');
      this.db.prepare("INSERT OR IGNORE INTO cleanup_requests(id,run_id,workspace_id,trigger,state) VALUES (?,?,?,?,'requested')").run(id, runId, workspace.id, trigger);
      if (!old) this.log(null, 'cleanup_requested', { requestId: id, runId, trigger, ...(audit?{context:audit}:{}) });
      return id;
    });
  }
  scheduleCompletionCleanup(): void {
    for (const run of this.runs()) if (run.state === 'completed' && this.runConfiguration(run.id)?.configuration.cleanup?.trigger === 'completion_verified')
      this.enqueueCleanup(run.id, `cleanup-${digest(run.id)}`, 'completion_verified');
  }
  cleanupRequests(runId?: string) {
    return this.db.prepare('SELECT * FROM cleanup_requests WHERE (? IS NULL OR run_id=?) ORDER BY rowid').all(runId ?? null, runId ?? null)
      .map(row => ({ id: String(row.id), runId: String(row.run_id), workspaceId: String(row.workspace_id), state: String(row.state),
        decisionId: row.decision_id as string | null, operation: row.operation ? validated('operation', JSON.parse(String(row.operation))) as RecordOf<'operation'>['request'] : null }));
  }
  cleanupDecision(requestId: string): { id: string; decision: CleanupDecisionV1 } | null {
    const row = this.db.prepare('SELECT d.id,d.payload FROM cleanup_requests r JOIN cleanup_decisions d ON d.id=r.decision_id WHERE r.id=?').get(requestId);
    if (!row) return null;
    const decision = validated('cleanup-decision', JSON.parse(String(row.payload)) as CleanupDecisionV1);
    if (digest(decision) !== row.id || decision.requestId !== requestId) throw new LifecycleError('identity_conflict');
    return { id: String(row.id), decision };
  }
  cleanupContext(requestId: string) {
    const saved = this.cleanupRequests().find(request => request.id === requestId); if (!saved) throw new LifecycleError('not_found');
    const run = this.get('run', saved.runId), request = this.get('request', run.requestId), workspace = this.get('workspace', saved.workspaceId);
    const snapshot = this.runConfiguration(run.id); if (!snapshot?.configuration.cleanup) throw new LifecycleError('effect_blocked');
    const operations = this.operations(run.id);
    const merges = operations.filter(op => op.request.actionId === 'labstride.github-merge').map(op => ({ operationId: op.id, record: this.mergeRecord(op.id) }));
    const deployments = operations.filter(op => op.request.actionId === workflowAction).map(op => {
      const enrollment = this.workflowEnrollment(op.id), order = this.deploymentOrder(op.id);
      return { operationId: op.id, enrollment, order, dispatch: this.workflowDispatch(op.id),
        evidence: this.deploymentEvidence(op.id), successor: this.successorEvidence(op.id),
        target: order ? this.deploymentOrderContext(op.id) : null,
        state: enrollment.deployment ? this.get('deployment', deploymentId(op.id)).state : null };
    });
    const context = { run, request, workspace, configDigest: snapshot.digest, policy: snapshot.configuration.cleanup,
      latestGeneration: Number(this.db.prepare('SELECT max(generation) AS n FROM requests WHERE installation_id=? AND provider_id=? AND issue_id=?')
        .get(request.installationId, request.providerId, request.issueId)!.n),
      policyStatus: this.policyStatus(request.installationId),
      peers: this.cleanupRequests().filter(other=>other.workspaceId===workspace.id && other.id!==requestId && other.operation!==null && other.state!=='retained'),
      controls: this.db.prepare('SELECT * FROM run_controls WHERE run_id=?').get(run.id) ?? null,
      recovery: this.db.prepare('SELECT * FROM recovery_control WHERE id=1').get()!, operations, merges, deployments,
      sessions: this.db.prepare('SELECT id FROM sessions WHERE run_id=? ORDER BY rowid').all(run.id).map(row=>this.get('session',String(row.id))), managed: this.managedSession(run.id),
      active: this.db.prepare('SELECT c.operation_id FROM claims c JOIN operations o ON o.id=c.operation_id WHERE o.workspace_id=? AND c.active=1').all(workspace.id),
      holds: this.db.prepare('SELECT * FROM resource_holds ORDER BY resource_key').all(),
      conflicts: this.db.prepare("SELECT d.id FROM deliveries d JOIN operations o ON o.id=d.operation_id WHERE o.run_id=? AND d.state='conflict'").all(run.id) };
    return { ...context, contextDigest: digest(context), recoveryEpoch: this.recoveryEpoch() };
  }
  cleanupLocalBlockers(context: ReturnType<CleanupStore['cleanupContext']>): string[] {
    const { run, workspace, operations, request, policy } = context, blockers: string[] = [];
    const add = (code: string) => { if (!blockers.includes(code)) blockers.push(code); };
    if (run.state !== 'completed') add('run_incomplete');
    if (workspace.keep) add('local_keep');
    if (!['ready', 'retained', 'cleanup_pending'].includes(workspace.state)) add('workspace_in_use');
    if (context.latestGeneration !== request.generation) add('generation_stale');
    if (run.paused || context.controls?.operator_paused || context.controls?.human_hold || context.controls?.budget_hold || context.controls?.cancel_requested || context.recovery.paused) add('local_hold');
    if(context.peers.length)add('cleanup_handoff_pending');
    if (context.active.length || context.conflicts.length) add('active_or_conflicting_operation');
    if (operations.some(op => op.state !== 'succeeded' && !(op.state === 'superseded' && this.successorSatisfied(op.id)))) add('operation_unresolved');
    if (context.sessions.some(session => session.kind === 'session' && (session.owner === 'human' || !['ready', 'closed'].includes(session.state)))) add('session_active_or_held');
    const merge = context.merges.filter(m => m.record?.outcome === 'confirmed' && m.record.enrollment.repository.nodeId === run.repositoryId &&
      operations.find(op => op.id === m.operationId)?.state === 'succeeded').at(-1);
    if (!merge) add('merge_unverified');
    if (policy.completion === 'merge_only') {
      if (context.deployments.length || Object.values(this.runConfiguration(run.id)!.configuration.workflows).flat().some(step => step.action === workflowAction)) add('deployment_policy_required');
    } else {
      if (!context.deployments.length) add('deployment_unverified');
      for (const deployment of context.deployments) {
        if (!deployment.enrollment.deployment || !deployment.target?.current || deployment.target.legacyBlocked ||
          deployment.target.current.evidence.sourceRepositoryId !== run.repositoryId ||
          context.holds.some(hold => hold.resource_key === workflowResource(deployment.enrollment))) { add('deployment_unverified'); continue; }
        if (deployment.state === 'superseded') {
          const successor = deployment.successor?.evidence;
          if (!successor || !merge || successor.mergeOperationId !== merge.operationId || successor.mergeRecordDigest !== digest(merge.record) ||
            successor.requestDigest !== operations.find(op=>op.id===deployment.operationId)?.request.requestDigest ||
            successor.mergeSha !== merge.record?.mergeSha || successor.comparison.repositoryId !== run.repositoryId ||
            successor.comparison.baseSha !== merge.record?.mergeSha || successor.comparison.headSha !== deployment.target.current.evidence.sourceSha ||
            successor.successorOperationId !== deployment.target.current.operationId || successor.successorEvidenceId !== deployment.target.current.evidenceId ||
            successor.comparison.relation !== 'ahead' && successor.comparison.relation !== 'identical') add('successor_unverified');
        } else if (deployment.state !== 'verified' || deployment.target.current.operationId !== deployment.operationId ||
          !merge || deployment.target.current.evidence.sourceSha !== merge.record?.mergeSha) add('deployment_unverified');
        if (this.db.prepare('SELECT 1 FROM workflow_dispatches WHERE resource_key=? AND (active=1 OR conflict=1)').get(workflowResource(deployment.enrollment))) add('delivery_active_or_unknown');
      }
    }
    try {
      const op = this.cleanupOperation(context, '0'.repeat(64)); this.assertPolicyOperation(run.id, op);
      if (this.runConfiguration(run.id)?.configuration.enabled !== true) add('policy_denied');
    } catch { add('policy_denied'); }
    return blockers;
  }
  private cleanupOperation(context: ReturnType<CleanupStore['cleanupContext']>, decisionId: string): RecordOf<'operation'>['request'] {
    const first = context.operations[0].request;
    const op: RecordOf<'operation'>['request'] = { ...first, operationId: `cleanup-action-${digest([context.run.id, decisionId])}`, actionId: context.policy.actionId,
      actionVersion: context.policy.actionVersion, inputs: { schemaVersion: '1.0', policy: context.policy, decisionId, workspaceId: context.workspace.id },
      deadline: new Date(Date.parse(this.clock.now()) + 30000).toISOString(), requestDigest: '' };
    op.requestDigest = requestDigest(op); return op;
  }
  recordCleanupDecision(context: ReturnType<CleanupStore['cleanupContext']>, input: CleanupDecisionV1): string {
    const decision = validated('cleanup-decision', input), id = digest(decision);
    return this.transaction(() => {
      if (this.cleanupContext(decision.requestId).contextDigest !== context.contextDigest || decision.contextDigest !== context.contextDigest ||
        decision.policyDigest !== digest(context.policy) || decision.recoveryEpoch !== this.recoveryEpoch() ||
        decision.eligible !== (decision.blockers.length === 0) || decision.eligible && (!decision.inspection || !decision.observations.merge || this.cleanupLocalBlockers(context).length)) throw new LifecycleError('stale_revision');
      this.db.prepare('INSERT OR IGNORE INTO cleanup_decisions VALUES (?,?,?)').run(id, decision.requestId, canonical(decision));
      this.db.prepare("UPDATE cleanup_requests SET decision_id=?,state=CASE WHEN operation IS NOT NULL THEN state ELSE ? END WHERE id=?")
        .run(id, decision.eligible ? 'eligible' : 'blocked', decision.requestId);
      this.log(null, 'cleanup_assessed', { requestId: decision.requestId, decisionId: id, blockers: decision.blockers }); return id;
    });
  }
  previewCleanupAssessment(requestId:string,decisionId:string):RecordOf<'operation'>['request'] {
    return this.cleanupOperation(this.cleanupContext(requestId),decisionId);
  }
  beginCleanupAssessment(requestId: string, decisionId: string, preview?:RecordOf<'operation'>['request']): RecordOf<'operation'>['request'] {
    return this.transaction(() => {
      const context = this.cleanupContext(requestId), saved = this.cleanupDecision(requestId), request = this.cleanupRequests().find(r => r.id === requestId)!;
      if (request.operation) throw new LifecycleError('effect_consumed');
      if (!saved || saved.id !== decisionId || !saved.decision.eligible || saved.decision.contextDigest !== context.contextDigest || this.cleanupLocalBlockers(context).length ||
        Date.parse(this.clock.now()) - Date.parse(saved.decision.observedAt) > 30000 || saved.decision.recoveryEpoch !== this.recoveryEpoch()) throw new LifecycleError('effect_blocked');
      const operation=preview?validated('operation',preview):this.cleanupOperation(context,decisionId);
      const expected=this.cleanupOperation(context,decisionId);expected.deadline=operation.deadline;expected.requestDigest=requestDigest(expected);
      if(canonical(operation)!==canonical(expected) || Date.parse(operation.deadline)<=Date.parse(this.clock.now()) || Date.parse(operation.deadline)>Date.parse(this.clock.now())+30000)throw new LifecycleError('identity_conflict');
      // Record possible invocation BEFORE calling the extension. No worker can
      // repeat start after a response loss or a coordinator restart.
      this.db.prepare("UPDATE cleanup_requests SET state='outcome_unknown',operation=? WHERE id=?").run(canonical(operation), requestId);
      return operation;
    });
  }
  cleanupAssessmentUnavailable(requestId:string): void {
    this.log(null,'cleanup_assessment_unavailable',{requestId});
    const context=this.cleanupContext(requestId);
    this.recordCleanupDecision(context,{schemaVersion:'1.0',requestId,contextDigest:context.contextDigest,policyDigest:digest(context.policy),recoveryEpoch:context.recoveryEpoch,observedAt:this.clock.now(),eligible:false,blockers:['cleanup_assessment_unknown'],evidenceRefs:[],inspection:null,observations:{merge:null,targets:[],sessions:[],managed:null,keep:null}});
  }
  finishCleanupAssessment(requestId: string, input: BoundResult): void {
    const result = validated('execution-record', input), request = this.cleanupRequests().find(r => r.id === requestId), op = request?.operation;
    if (result.kind !== 'result' || !op || result.operationId !== op.operationId || result.requestDigest !== op.requestDigest || result.result.resources.length ||
      !['pending_executor', 'retain'].includes(String(result.result.outputs.cleanupDisposition)) || result.result.error !== null ||
      !['accepted', 'succeeded'].includes(result.result.status)) throw new LifecycleError('identity_conflict');
    const previous=this.db.prepare('SELECT result FROM cleanup_requests WHERE id=?').get(requestId);
    if(previous?.result && previous.result!==canonical(result))throw new LifecycleError('identity_conflict');
    this.db.prepare('UPDATE cleanup_requests SET state=?,result=? WHERE id=?').run(result.result.outputs.cleanupDisposition === 'retain' ? 'retained' : 'pending_executor', canonical(result), requestId);
  }
}
