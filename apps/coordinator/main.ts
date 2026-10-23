import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createCoordinator, LifecycleError } from '../../packages/core/lifecycle.ts';
import { ConfigurationStore } from '../../packages/storage-sqlite/configuration.ts';
import type { StoreDependencies } from '../../packages/storage-sqlite/store.ts';

export function startCoordinator(dataDir: string, dependencies: StoreDependencies = {}) {
  const store = new ConfigurationStore(dataDir, dependencies);
  const coordinator = createCoordinator(store, dependencies.clock ?? { now: () => new Date().toISOString() },
    dependencies.identities ?? { next: randomUUID });
  try { return { coordinator, store, recovered: coordinator.recover() }; }
  catch (error) { coordinator.close(); throw error; }
}

// A bounded bootstrap/inspection entrypoint, not the later authenticated operator CLI.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new LifecycleError('invalid_payload');
    const runtime = startCoordinator(process.argv[2]);
    console.log(JSON.stringify(runtime.recovered));
    runtime.coordinator.close();
  } catch (error) {
    console.error(JSON.stringify({ schemaVersion: '1.0', error: error instanceof LifecycleError ? error.code : 'storage_failure' }));
    process.exitCode = 1;
  }
}
