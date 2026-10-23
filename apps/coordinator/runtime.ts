import { startCoordinator } from './main.ts';
import { createControlWorker } from '../../packages/core/control-worker.ts';
import { createWorker } from '../../packages/core/worker.ts';
import type { WorkerOptions } from '../../packages/core/worker.ts';
import { createObservationWorker } from '../../packages/core/observation-worker.ts';
import type { ObservationOptions } from '../../packages/core/observation-worker.ts';
import type { AuditContext } from '../../packages/core/lifecycle.ts';
import type { StoreDependencies } from '../../packages/storage-sqlite/store.ts';
import { sessionResolver } from '../../packages/extensions/session-provider.ts';
import type { HostProfile } from '../../packages/extensions/loader.ts';
import { createSessionAction, sessionAction, sessionActionVersion } from '../../packages/core/sessions.ts';
import { pinnedSessionObserver } from '../../packages/core/session-runtime.ts';
import { actionKey } from '../../packages/core/worker.ts';
import { createGitHubWorker } from '../../packages/core/github-worker.ts';
import type { GitHubOptions } from '../../packages/core/github.ts';
import { configuredTargetAction } from '../../packages/connector-ssh/runtime.ts';
import { reserveAction, reserveVersion } from '../../packages/target-helper/registry.ts';

// Trusted embedding API only. No listener, code loader, default adapters or background timer.
export function startExecution(dataDir: string, options: {
  actions: WorkerOptions; observations: ObservationOptions; restore?: AuditContext; dependencies?: StoreDependencies;
  installedSessions?: { host: HostProfile; providerIds: string[] };
  github?: GitHubOptions;
  installedTargets?: { host: HostProfile };
}) {
  const runtime = startCoordinator(dataDir, options.dependencies);
  const resolver = options.installedSessions && sessionResolver(options.installedSessions.host);
  try {
    if (options.restore) runtime.store.enterRestore(options.restore);
    const actionOptions = { ...options.actions, adapters: new Map(options.actions.adapters) };
    if (options.installedTargets) actionOptions.adapters.set(actionKey(reserveAction, reserveVersion), configuredTargetAction(runtime.store, options.installedTargets.host));
    const observationOptions = { ...options.observations, sessions: new Map(options.observations.sessions),projections:new Map(options.observations.projections) };
    if(options.github?.adapter.projection)observationOptions.projections.set(options.github.adapter.providerId,options.github.adapter.projection(runtime.store));
    if (resolver) {
      actionOptions.adapters.set(actionKey(sessionAction, sessionActionVersion), createSessionAction(runtime.store, resolver.resolve));
      for (const id of options.installedSessions!.providerIds) observationOptions.sessions.set(id, pinnedSessionObserver(runtime.store, resolver.resolve));
    }
    const actions = createWorker(runtime.store, actionOptions);
    const controls = createControlWorker(runtime.store, options.actions);
    const observations = createObservationWorker(runtime.store, observationOptions);
    const github = options.github && createGitHubWorker(runtime.store, options.github);
    let observationJob: Promise<void> | undefined;
    let observationError: unknown;
    let closed = false;
    return { ...runtime,
      async tick(): Promise<void> {
        if (closed) return;
        if (!observationJob) observationJob = (async () => { await github?.tick(); await observations.tick(); })().catch(error => { observationError = error; })
          .finally(() => { observationJob = undefined; });
        await controls.tick(); await actions.tick();
      },
      async drain(): Promise<void> {
        await observationJob; await controls.drain(); await actions.drain();
        if (observationError) { const error = observationError; observationError = undefined; throw error; }
      },
      async close(): Promise<void> {
        closed = true;
        try { await this.drain(); await controls.close(); await actions.close(); } finally { await resolver?.close(); runtime.store.close(); }
      },
    };
  } catch (error) { runtime.store.close(); throw error; }
}
