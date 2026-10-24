import type { DeploymentOrderCheckV1 } from '../../contracts/generated/deployment-order-check.ts';
import type { DeploymentSuccessorEvidenceV1 } from '../../contracts/generated/deployment-successor-evidence.ts';
import type { WorkflowProvider } from '../../packages/core/workflow-broker.ts';
function inspect(check: DeploymentOrderCheckV1, successor: DeploymentSuccessorEvidenceV1, provider: WorkflowProvider) {
  // @ts-expect-error A decision about queue order is not deployment verification.
  check.decision = 'verified';
  // @ts-expect-error Successor evidence carries the actual merge, never an assumed PR head.
  successor.expectedHead;
  if (provider.compare) {
    // @ts-expect-error The comparison requires repository-bound source identity and both SHAs.
    provider.compare('a', 'b');
  }
}
void inspect;
