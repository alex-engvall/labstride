import type { MergeInput, MergeEnrollment, MergeProvider } from '../../packages/core/merges.ts';

function inspect(input: MergeInput, enrollment: MergeEnrollment, provider: MergeProvider) {
  input.expectedHead.toUpperCase();
  enrollment.credentialRef.toUpperCase();
  // @ts-expect-error An operation payload cannot select a credential.
  input.credentialRef;
  // @ts-expect-error A merge request cannot grant itself a policy bypass.
  input.bypass;
  // @ts-expect-error The provider contract has no protection-changing method.
  provider.disableProtections();
}
void inspect;
