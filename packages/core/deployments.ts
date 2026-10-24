import { LifecycleError } from './lifecycle.ts';
import { digest } from '../configuration/json.ts';
import { validated } from '../storage-sqlite/validation.ts';

export type DeploymentProfile = import('../../contracts/generated/deployment-profile.ts').DeploymentProfileV1;
export type TargetObservationRequest = import('../../contracts/generated/target-observation-request.ts').TargetObservationRequestV1;
export type TargetObservation = import('../../contracts/generated/target-observation.ts').IndependentTargetObservationV1;
export type DeploymentEvidence = import('../../contracts/generated/deployment-evidence.ts').DeploymentEvidenceV1;

// Only the trusted embedding application registers code. Neither a recipe input,
// receipt nor a hook can import an observer or grant it credentials.
export interface DeploymentObserver {
  id: string;
  version: string;
  validate(configuration: Record<string, unknown>): void | Promise<void>;
  observe(request: TargetObservationRequest, signal: AbortSignal): Promise<unknown>;
}
export type DeploymentObservers = ReadonlyMap<string, DeploymentObserver>;
export const observerKey = (id: string, version: string): string => JSON.stringify([id, version]);
export const deploymentId = (operationId: string): string => `deployment-${digest(operationId)}`;

export function resolveObserver(profile: DeploymentProfile, observers: DeploymentObservers): DeploymentObserver {
  const observer = observers.get(observerKey(profile.observer.id, profile.observer.version));
  if (!observer || observer.id !== profile.observer.id || observer.version !== profile.observer.version ||
    typeof observer.validate !== 'function' || typeof observer.observe !== 'function') throw new LifecycleError('unsupported_capability');
  return observer;
}

export function recoveryDetails(profile: DeploymentProfile, targetId: string, environment: string) {
  const { recovery, recipe } = profile, qualification = recovery.rollback.qualification;
  const rollbackQualified = recovery.methods.includes('rollback') && recovery.rollback.supported &&
    recovery.migration.strategy === 'compatible' && qualification !== null &&
    qualification.recipeDigest === recipe.digest && qualification.targetId === targetId && qualification.environment === environment;
  return { ...recovery, rollbackQualified, automaticRollback: false, separateAuthorizationRequired: true };
}

// The coordinator derives these conclusions; observers never return a deployment
// verdict or an expected source revision. Missing facts preserve uncertainty.
export function targetVerdict(request: TargetObservationRequest, input: unknown, profile: DeploymentProfile,
  expected: { repositoryId: string; sha: string }, now: string): Pick<DeploymentEvidence, 'status' | 'blocker'> {
  let target: TargetObservation;
  try { target = validated('target-observation', input as TargetObservation); }
  catch { return { status: 'outcome_unknown', blocker: 'target_observation_invalid' }; }
  if (target.observationId !== request.observationId || target.targetId !== request.targetId || target.environment !== request.environment ||
    target.sourceRepositoryId !== expected.repositoryId) return { status: 'outcome_unknown', blocker: 'target_identity_mismatch' };
  const age = Date.parse(now) - Date.parse(target.observedAt);
  if (age < 0 || age > (profile.maxObservationAgeMs ?? 30000)) return { status: 'outcome_unknown', blocker: 'target_observation_stale' };
  if (target.health === 'unhealthy') return { status: 'failed', blocker: 'target_unhealthy' };
  if (target.sourceSha !== expected.sha) return { status: 'outcome_unknown', blocker: 'target_revision_mismatch' };
  if (target.health !== 'healthy') return { status: 'outcome_unknown', blocker: 'target_health_unknown' };
  return { status: 'verified', blocker: 'none' };
}
