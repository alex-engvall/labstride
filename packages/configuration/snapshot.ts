import type { EffectiveInstallationConfigurationSnapshot } from '../../contracts/generated/configuration-snapshot.ts';
import { validated } from '../storage-sqlite/validation.ts';
import { LifecycleError } from '../core/lifecycle.ts';
import { digest } from './json.ts';

export type ConfigurationSnapshot = EffectiveInstallationConfigurationSnapshot;
export function checkedSnapshot(input: ConfigurationSnapshot): ConfigurationSnapshot {
  const snapshot = validated('configuration-snapshot', input);
  const { digest: expected, ...contents } = snapshot;
  if (digest(contents) !== expected) throw new LifecycleError('identity_conflict');
  return snapshot;
}
