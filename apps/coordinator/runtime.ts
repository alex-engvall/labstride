import { createCleanupWorker } from '../../packages/core/cleanup-worker.ts';
import type { CleanupOptions } from '../../packages/core/cleanup-worker.ts';
import { configuredCleanupInspection, configuredCleanupDeletion } from '../../packages/connector-ssh/cleanup.ts';
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
import { configuredMergeAction } from '../../packages/github-merge/action.ts';
import { mergeAction, mergeVersion } from '../../packages/core/merges.ts';
import type { MergeProvider } from '../../packages/core/merges.ts';
import type { RequestListener } from 'node:http';
import { LifecycleError } from '../../packages/core/lifecycle.ts';
import type { ExecutionMode } from '../../packages/core/execution.ts';

// Trusted embedding API. A workflow listener requires explicit broker options; no background timer.
export function startExecution(dataDir: string, options: {
  mode?: ExecutionMode;
  actions: WorkerOptions; observations: ObservationOptions; restore?: AuditContext; dependencies?: StoreDependencies;
  installedSessions?: { host: HostProfile; providerIds: string[] };
  github?: GitHubOptions;
  installedTargets?: { host: HostProfile };
  workflowBroker?: { host: HostProfile; provider: WorkflowProvider; port: number; observers?: DeploymentObservers; diagnostics?: RequestListener; allowEffects?: () => boolean };
  githubMerge?: { host: HostProfile; provider: MergeProvider };
  additionalActions?: (store: ReturnType<typeof startCoordinator>['store']) => ReadonlyMap<string, import('../../packages/core/execution.ts').ActionAdapter>;
  cleanup?: Omit<CleanupOptions, 'inspect'> & { inspect?: CleanupOptions['inspect'] };
  serialized?: boolean;
}) {
  const mode = options.mode ?? 'normal';
  if (!['normal', 'reconcile-only'].includes(mode) || mode === 'reconcile-only' && options.restore) throw new LifecycleError('invalid_payload');
  const runtime = startCoordinator(dataDir, { ...options.dependencies, existingOnly: mode === 'reconcile-only' || options.dependencies?.existingOnly });
  const resolver = options.installedSessions && sessionResolver(options.installedSessions.host);
  try {
    if (options.restore) runtime.store.enterRestore(options.restore);
    const recovery = runtime.store.recoveryStatus();
    const assertRecovery = () => {
      if (mode === 'reconcile-only' && (!runtime.store.recoveryStatus().paused || runtime.store.recoveryEpoch() !== recovery.epoch))
        throw new LifecycleError('recovery_required');
    };
    assertRecovery();
    const allowEffects = () => mode === 'normal' && options.workflowBroker?.allowEffects?.() !== false;
    const actionOptions = { ...options.actions, mode, adapters: new Map(options.actions.adapters) };
    for (const [key, adapter] of options.additionalActions?.(runtime.store) ?? []) actionOptions.adapters.set(key, adapter);
    if (options.installedTargets) actionOptions.adapters.set(actionKey(reserveAction, reserveVersion), configuredTargetAction(runtime.store, options.installedTargets.host));
    if (options.installedTargets) actionOptions.adapters.set(actionKey(workspaceAction, workspaceVersion), configuredWorkspaceAction(runtime.store, options.installedTargets.host));
    if (options.installedTargets) actionOptions.adapters.set(actionKey(runtimeAction, runtimeVersion), configuredRuntimeAction(runtime.store, options.installedTargets.host));
    if (options.workflowBroker) {
      const adapter = configuredWorkflowAction(runtime.store, options.workflowBroker.host, options.workflowBroker.provider, options.workflowBroker.observers);
      const allowed = () => { if (!allowEffects()) throw new LifecycleError('effect_blocked'); };
      actionOptions.adapters.set(actionKey(workflowAction, workflowVersion), { ...adapter,
        async validate(operation) { allowed(); await adapter.validate(operation); },
        async start(operation, claim) { allowed(); return adapter.start(operation, claim); },
      });
    }
    if (options.githubMerge) actionOptions.adapters.set(actionKey(mergeAction, mergeVersion),
      configuredMergeAction(runtime.store, options.githubMerge.host, options.githubMerge.provider));
    const observationOptions = { ...options.observations, mode, sessions: new Map(options.observations.sessions),projections:new Map(options.observations.projections) };
    if(options.github?.adapter.projection)observationOptions.projections.set(options.github.adapter.providerId,options.github.adapter.projection(runtime.store));
    if (resolver) {
      actionOptions.adapters.set(actionKey(sessionAction, sessionActionVersion), installedSessionAction(runtime.store, options.installedSessions!.host, resolver.resolve));
      for (const id of options.installedSessions!.providerIds) observationOptions.sessions.set(id, pinnedSessionObserver(runtime.store, resolver.resolve));
    }
    const cleanup = mode === 'normal' && options.cleanup ? createCleanupWorker(runtime.store, { ...options.cleanup,
      mergeProvider: options.cleanup.mergeProvider ?? options.githubMerge?.provider, observers: options.cleanup.observers ?? options.workflowBroker?.observers,
      session: options.cleanup.session ?? (async session => { const observer=observationOptions.sessions.get(session.providerId); if(!observer)throw Error('unsupported_capability');return observer.observe(session); }),
      deleteTarget: options.cleanup.deleteTarget ?? configuredCleanupDeletion(runtime.store, options.cleanup.host),
      inspect: options.cleanup.inspect ?? configuredCleanupInspection(runtime.store, options.cleanup.host) }) : undefined;
    const actions = createWorker(runtime.store, actionOptions);
    const controls = createControlWorker(runtime.store, actionOptions);
    const observations = createObservationWorker(runtime.store, observationOptions);
    const github = mode === 'normal' && options.github ? createGitHubWorker(runtime.store, options.github) : undefined;
    const broker = options.workflowBroker && createWorkflowBroker(runtime.store, options.workflowBroker.provider, undefined,
      { handler: options.workflowBroker.diagnostics, allowEffects });
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
        assertRecovery();
        if (mode === 'reconcile-only') {
          await actions.tick(); await actions.drain(); await observations.tick();
          return;
        }
        if (options.serialized) {
          await controls.tick(); await controls.drain();
          await actions.tick(); await actions.drain();
          await github?.tick(); await observations.tick(); await cleanup?.tick();
          return;
        }
        if (!observationJob) observationJob = (async () => { await github?.tick(); await observations.tick(); await cleanup?.tick(); })().catch(error => { observationError = error; })
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
