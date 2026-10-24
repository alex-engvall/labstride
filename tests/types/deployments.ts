import type { DeploymentObserver, DeploymentEvidence, TargetObservationRequest } from '../../packages/core/deployments.ts';

function inspect(observer: DeploymentObserver, request: TargetObservationRequest, evidence: DeploymentEvidence) {
  // @ts-expect-error A read-only observer has no delivery or recovery method.
  observer.rollback();
  // @ts-expect-error Independent reads receive no expected application revision.
  request.expectedSourceSha;
  // @ts-expect-error A target sample is not an authenticated workflow receipt.
  evidence.target?.claimId;
}
void inspect;
