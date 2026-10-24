import { installedSessionAction } from '../../packages/extensions/session-action.ts';
import { configuredWorkspaceAction } from '../../packages/connector-ssh/workspaces.ts';
import { workspaceAction, workspaceVersion } from '../../packages/target-helper/workspace-contracts.ts';
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
import { sessionAction, sessionActionVersion } from '../../packages/core/sessions.ts';
import { pinnedSessionObserver } from '../../packages/core/session-runtime.ts';
import { actionKey } from '../../packages/core/worker.ts';
import { createGitHubWorker } from '../../packages/core/github-worker.ts';
import type { GitHubOptions } from '../../packages/core/github.ts';
import { configuredTargetAction } from '../../packages/connector-ssh/runtime.ts';
import { reserveAction, reserveVersion } from '../../packages/target-helper/registry.ts';
import { configuredRuntimeAction } from '../../packages/connector-ssh/runtimes.ts';
import { runtimeAction, runtimeVersion } from '../../packages/target-helper/runtime-contracts.ts';
import { configuredWorkflowAction } from '../../packages/workflow-broker/action.ts';
import { createWorkflowBroker } from '../../packages/workflow-broker/server.ts';
import { workflowAction, workflowVersion } from '../../packages/core/workflow-broker.ts';
import type { WorkflowProvider } from '../../packages/core/workflow-broker.ts';
import type { DeploymentObservers } from '../../packages/core/deployments.ts';

// Trusted embedding API. A workflow listener requires explicit broker options; no background timer.
export function startExecution(dataDir: string, options: {
  actions: WorkerOptions; observations: ObservationOptions; restore?: AuditContext; dependencies?: StoreDependencies;
  installedSessions?: { host: HostProfile; providerIds: string[] };
  github?: GitHubOptions;
  installedTargets?: { host: HostProfile };
  workflowBroker?: { host: HostProfile; provider: WorkflowProvider; port: number; observers?: DeploymentObservers };
  additionalActions?: (store: ReturnType<typeof startCoordinator>['store']) => ReadonlyMap<string, import('../../packages/core/execution.ts').ActionAdapter>;
  serialized?: boolean;
}) {
  const runtime = startCoordinator(dataDir, options.dependencies);
  const resolver = options.installedSessions && sessionResolver(options.installedSessions.host);
  try {
    if (options.restore) runtime.store.enterRestore(options.restore);
    const actionOptions = { ...options.actions, adapters: new Map(options.actions.adapters) };
    for (const [key, adapter] of options.additionalActions?.(runtime.store) ?? []) actionOptions.adapters.set(key, adapter);
    if (options.installedTargets) actionOptions.adapters.set(actionKey(reserveAction, reserveVersion), configuredTargetAction(runtime.store, options.installedTargets.host));
    if (options.installedTargets) actionOptions.adapters.set(actionKey(workspaceAction, workspaceVersion), configuredWorkspaceAction(runtime.store, options.installedTargets.host));
    if (options.installedTargets) actionOptions.adapters.set(actionKey(runtimeAction, runtimeVersion), configuredRuntimeAction(runtime.store, options.installedTargets.host));
    if (options.workflowBroker) actionOptions.adapters.set(actionKey(workflowAction, workflowVersion),
      configuredWorkflowAction(runtime.store, options.workflowBroker.host, options.workflowBroker.provider, options.workflowBroker.observers));
    const observationOptions = { ...options.observations, sessions: new Map(options.observations.sessions),projections:new Map(options.observations.projections) };
    if(options.github?.adapter.projection)observationOptions.projections.set(options.github.adapter.providerId,options.github.adapter.projection(runtime.store));
    if (resolver) {
      actionOptions.adapters.set(actionKey(sessionAction, sessionActionVersion), installedSessionAction(runtime.store, options.installedSessions!.host, resolver.resolve));
      for (const id of options.installedSessions!.providerIds) observationOptions.sessions.set(id, pinnedSessionObserver(runtime.store, resolver.resolve));
    }
    const actions = createWorker(runtime.store, actionOptions);
    const controls = createControlWorker(runtime.store, actionOptions);
    const observations = createObservationWorker(runtime.store, observationOptions);
    const github = options.github && createGitHubWorker(runtime.store, options.github);
    const broker = options.workflowBroker && createWorkflowBroker(runtime.store, options.workflowBroker.provider);
    const ready = broker ? new Promise<void>((resolve, reject) => {
      broker.once('error', reject);
      broker.listen(options.workflowBroker!.port, '127.0.0.1', () => resolve());
    }) : Promise.resolve();
    // Startup failure is reported through ready/tick, without an unhandled rejection.
    void ready.catch(() => {});
    let observationJob: Promise<void> | undefined;
    let observationError: unknown;
    let closed = false;
    return { ...runtime, ready,
      async tick(): Promise<void> {
        if (closed) return;
        await ready;
        if (options.serialized) {
          await controls.tick(); await controls.drain();
          await actions.tick(); await actions.drain();
          await github?.tick(); await observations.tick();
          return;
        }
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
        try {
          await ready.catch(() => {});
          if (broker?.listening) await new Promise<void>((resolve, reject) => broker.close(error => error ? reject(error) : resolve()));
          await this.drain(); await controls.close(); await actions.close();
        } finally { await resolver?.close(); runtime.store.close(); }
      },
    };
  } catch (error) { runtime.store.close(); throw error; }
}
