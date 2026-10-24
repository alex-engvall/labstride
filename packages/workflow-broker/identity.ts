import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import { BrokerError, matchingRun } from '../core/workflow-broker.ts';
import type { WorkflowClaim, WorkflowProvider, WorkflowDispatch, Operation } from '../core/workflow-broker.ts';
export const workflowIssuer = 'https://token.actions.githubusercontent.com';
export function createWorkflowVerifier(provider: WorkflowProvider, options: { getKey?: JWTVerifyGetKey; currentDate?: Date } = {}) {
  const getKey = options.getKey ?? createRemoteJWKSet(new URL(`${workflowIssuer}/.well-known/jwks`), { timeoutDuration: 5000, cooldownDuration: 30000 });
  return async (token: string, audience: string, dispatch: WorkflowDispatch, op: Operation, phase: 'claim' | 'authorize-effect' | 'receipt'): Promise<WorkflowClaim['executor']> => {
    const reject = () => new BrokerError('identity_rejected', 403);
    if (typeof token !== 'string' || token.length > 16384 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw reject();
    let claims;
    try {
      ({ payload: claims } = await jwtVerify(token, getKey, { issuer: workflowIssuer, audience, algorithms: ['RS256'], clockTolerance: 0,
        currentDate: options.currentDate, maxTokenAge: '10 minutes', requiredClaims: ['sub','jti','iat','nbf','exp','repository','repository_id',
          'repository_owner_id','workflow_ref','workflow_sha','ref','sha','run_id','run_attempt','event_name','runner_environment','environment'] }));
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (error instanceof TypeError || (error as Error).name === 'AbortError' || ['ERR_JWKS_TIMEOUT','ERR_JWKS_INVALID','ERR_JOSE_GENERIC'].includes(code ?? ''))
        throw new BrokerError('provider_unavailable', 503);
      throw reject();
    }
    const enrollment = dispatch.enrollment;
    const expected = { repository: enrollment.repository.name, repository_id: enrollment.repository.id, repository_owner_id: enrollment.repository.ownerId,
      workflow_ref: `${enrollment.repository.name}/${enrollment.workflowPath}@${enrollment.ref}`, workflow_sha: enrollment.workflowSha,
      ref: enrollment.ref, sha: enrollment.workflowSha, event_name: 'workflow_dispatch', runner_environment: 'github-hosted', environment: enrollment.environment };
    if (Object.entries(expected).some(([key, value]) => claims[key] !== value) || claims.aud !== audience ||
      typeof claims.sub !== 'string' || !claims.sub || typeof claims.jti !== 'string' || !claims.jti ||
      ![claims.iat,claims.nbf,claims.exp].every(Number.isSafeInteger) || claims.exp! <= claims.iat! || claims.nbf! > claims.iat! ||
      typeof claims.run_id !== 'string' || !/^[1-9][0-9]{0,31}$/.test(claims.run_id) ||
      typeof claims.run_attempt !== 'string' || !/^[1-9][0-9]{0,8}$/.test(claims.run_attempt) ||
      claims.job_workflow_ref !== undefined || claims.job_workflow_sha !== undefined) throw reject();
    const runId = claims.run_id, attempt = Number(claims.run_attempt);
    if (dispatch.runId !== null && dispatch.runId !== runId) throw new BrokerError('claim_conflict', 409);
    const run = await provider.run(enrollment, runId, attempt);
    if (run.runId !== runId || run.runAttempt !== attempt || !matchingRun(enrollment, op, run, dispatch.submittedAt) ||
      (phase === 'receipt' ? !['in_progress','completed'].includes(run.status) : run.status !== 'in_progress')) throw reject();
    return { provider: 'github-actions', repositoryId: enrollment.repository.id, workflowPath: enrollment.workflowPath,
      workflowSha: enrollment.workflowSha, runId, runAttempt: attempt };
  };
}
