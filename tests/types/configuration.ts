import type { Compilation, ProviderBinding } from '../../packages/configuration/compiler.ts';
import type { RuleObservation } from '../../packages/configuration/rules.ts';
function configurationTypes(result: Compilation, observed: RuleObservation, binding: ProviderBinding) {
  if (!result.ok) {
    // @ts-expect-error Failed preflight has no enabled/compiled configuration.
    result.configuration;
  } else {
    const digest: string = result.configuration.snapshot.digest;
    void digest;
  }
  const state = observed.current.request;
  if (!state.present) {
    // @ts-expect-error Confirmed absence carries no implicit default or null value.
    state.value;
  }
  // @ts-expect-error Provider bindings cannot claim arbitrary executable field types.
  const forbiddenType: typeof binding.type = 'shell';
  void forbiddenType;
}
void configurationTypes;
