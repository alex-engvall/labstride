import type { ConfigurationSnapshot } from '../configuration/snapshot.ts';
import { checkedSnapshot } from '../configuration/snapshot.ts';
import { validated } from '../storage-sqlite/validation.ts';
import { digest, requestDigest } from '../storage-sqlite/execution.ts';
import { LifecycleError } from '../core/lifecycle.ts';
import { workflowAction, workflowVersion } from '../core/workflow-broker.ts';
import type { Operation, Enrollment } from '../core/workflow-broker.ts';

export function enrolledWorkflow(saved: ConfigurationSnapshot | null, op: Operation): Enrollment {
  if (!saved) throw new LifecycleError('effect_blocked');
  const snapshot = checkedSnapshot(saved), broker = snapshot.configuration.broker;
  const input = validated('workflow-input', op.inputs as unknown as import('../../contracts/generated/workflow-input.ts').WorkflowActionInputV1);
  const pin = snapshot.extensionLock.extensions.find(pin => pin.id === workflowAction && pin.version === workflowVersion && pin.kind === 'action');
  const enrollments = pin?.configuration.enrollments as Record<string, Enrollment> | undefined;
  const selected = enrollments && Object.hasOwn(enrollments, input.enrollment) ? enrollments[input.enrollment] : null;
  const enrollment = validated('workflow-enrollment', selected as Enrollment);
  if (broker.enabled === false || op.actionId !== workflowAction || op.actionVersion !== workflowVersion ||
    op.configDigest !== snapshot.digest || op.requestDigest !== requestDigest(op) ||
    input.target !== op.targetId || enrollment.targetId !== op.targetId || digest(input.source) !== digest(op.source)) throw new LifecycleError('identity_conflict');
  if (enrollment.ref.includes('..') || enrollment.ref.endsWith('/') || enrollment.ref.includes('//')) throw new LifecycleError('invalid_payload');
  return enrollment;
}
