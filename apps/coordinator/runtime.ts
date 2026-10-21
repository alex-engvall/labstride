import { startCoordinator } from './main.ts';
import { createWorker } from '../../packages/core/worker.ts';
import type { WorkerOptions } from '../../packages/core/worker.ts';
import { createObservationWorker } from '../../packages/core/observation-worker.ts';
import type { ObservationOptions } from '../../packages/core/observation-worker.ts';
import type { AuditContext } from '../../packages/core/lifecycle.ts';
import type { StoreDependencies } from '../../packages/storage-sqlite/store.ts';

// Trusted embedding API only. No listener, code loader, default adapters or background timer.
export function startExecution(dataDir: string, options: {
  actions: WorkerOptions; observations: ObservationOptions; restore?: AuditContext; dependencies?: StoreDependencies;
}) {
  const runtime = startCoordinator(dataDir, options.dependencies);
  try {
    if (options.restore) runtime.store.enterRestore(options.restore);
    const actions = createWorker(runtime.store, options.actions);
    const observations = createObservationWorker(runtime.store, options.observations);
    let running: Promise<void> | undefined;
    return { ...runtime,
      tick(): Promise<void> {
        if (running) return running;
        running = (async () => { await observations.tick(); await actions.tick(); })().finally(() => { running = undefined; });
        return running;
      },
      async close(): Promise<void> { await running; runtime.store.close(); },
    };
  } catch (error) { runtime.store.close(); throw error; }
}
