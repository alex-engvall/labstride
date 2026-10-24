import type { ConfigurationSnapshot } from '../configuration/snapshot.ts';
import { checkedSnapshot } from '../configuration/snapshot.ts';
import { validated } from '../storage-sqlite/validation.ts';
import { digest, requestDigest } from '../storage-sqlite/execution.ts';
import { mergeAction, mergeVersion, MergeBlocked } from '../core/merges.ts';
import type { MergeEnrollment, MergeInput, MergeOperation } from '../core/merges.ts';

export function enrolledMerge(saved: ConfigurationSnapshot | null, op: MergeOperation): { enrollment: MergeEnrollment; input: MergeInput } {
  if (!saved) throw new MergeBlocked('merge_not_enrolled');
  const snapshot = checkedSnapshot(saved), input = validated('merge-input', op.inputs as unknown as MergeInput);
  const pin = snapshot.extensionLock.extensions.find(pin => pin.id === mergeAction && pin.version === mergeVersion && pin.kind === 'action');
  const enrollments = pin?.configuration.enrollments as Record<string, MergeEnrollment> | undefined;
  const enrollment = validated('merge-enrollment', enrollments && Object.hasOwn(enrollments, input.enrollment) ? enrollments[input.enrollment] : null) as MergeEnrollment;
  if (op.actionId !== mergeAction || op.actionVersion !== mergeVersion || op.configDigest !== snapshot.digest ||
    op.requestDigest !== requestDigest(op) || input.target !== op.targetId || enrollment.targetId !== op.targetId ||
    digest(input.source) !== digest(op.source) || input.expectedHead !== op.source.sha ||
    op.source.repositoryId !== enrollment.repository.nodeId || op.source.repository !== enrollment.repository.name ||
    enrollment.baseBranch.includes('..') || enrollment.baseBranch.endsWith('/') || enrollment.baseBranch.includes('//')) throw new MergeBlocked('merge_identity_mismatch');
  return { enrollment, input };
}
