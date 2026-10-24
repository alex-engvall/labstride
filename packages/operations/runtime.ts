import { readFileSync, mkdirSync, lstatSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { createLocalPolicyAuthority } from '../core/policy.ts';
import { startExecution } from '../../apps/coordinator/runtime.ts';
import { GitHubClient } from '../provider-github/client.ts';
import { GitHubIssueFieldsAdapter } from '../provider-github/issue-fields.ts';
import { compileConfiguration } from '../configuration/compiler.ts';
import { credentialResolver, GitHubRest } from './github.ts';
import { configuredSelfBuildAction } from './self-build.ts';
import { BridgeClient } from './bridge.ts';
import { workspaceStart } from '../storage-sqlite/workflows.ts';
import { validated } from '../storage-sqlite/validation.ts';
import { readProtected, protectedPath, assertPrivateDatabase, rootIdentity, sameIdentity } from '../target-helper/filesystem.ts';
import { assertSeparate } from '../storage-sqlite/paths.ts';
import { digest } from '../configuration/json.ts';
import { actionKey } from '../core/worker.ts';
import { workspaceTargetResolver } from '../connector-ssh/workspaces.ts';
import { freezeProfile } from '../extensions/loader.ts';
import { migrations } from '../storage-sqlite/migrations.ts';
import type { OperationalInstallationV1 } from '../../contracts/generated/operational-installation.ts';
import type { WorkflowStore } from '../storage-sqlite/workflows.ts';
import { publishRunSummary } from './summary.ts';
import { loadExtension } from '../extensions/loader.ts';
import { GitHubWorkflowProvider } from '../provider-github/workflows.ts';
import { GitHubMergeProvider } from '../provider-github/merges.ts';

export function loadInstallation(path: string): OperationalInstallationV1 {
  return validated('operational-installation', JSON.parse(readProtected(path).toString('utf8')) as OperationalInstallationV1);
}
export function installationShape(spec: OperationalInstallationV1) {
  validated('operational-installation', spec); assertSeparate(spec.stateDirectory, spec.sourceRoot);
  const config = spec.configuration, selfBuild = spec.lock.extensions.find(pin => pin.id === 'labstride.self-build');
  const workflows = Object.values(config.workflows).flat().some(step => step.action === 'labstride.github-workflow');
  const merges = Object.values(config.workflows).flat().some(step => step.action === 'labstride.github-merge');
  if (merges && spec.mergeEnabled !== true) throw Error('merge_not_enabled');
  if ((spec.brokerListener && config.broker.enabled === false) || (workflows && !spec.brokerListener)) throw Error('broker_configuration_invalid');
  const expected = { agent: spec.agent, sourceRoot: spec.sourceRoot, rootId: spec.rootId, baseBranch: spec.baseBranch, requiredWorkflows: spec.requiredWorkflows };
  if (!selfBuild || digest(selfBuild.configuration) !== digest(expected) || config.installationId !== spec.policy.installationId ||
    !config.github.repositories.every(repository => spec.policy.repositories.some(entry => entry.name === repository))) throw Error('installation_binding_invalid');
  const fields = config.fields;
  if (['request', 'aiMode', 'model', 'reasoning', 'session', 'path'].some(name => fields[name]?.source !== 'organization_issue_field') ||
    new Set(['request', 'aiMode', 'model', 'reasoning', 'session', 'path'].map(name => fields[name].fieldId)).size !== 6) throw Error('installation_binding_invalid');
  for (const name of ['aiMode', 'model', 'reasoning'] as const) {
    const defaultId = spec.agent.defaults[name];
    if (!Object.values(fields[name].options ?? {}).includes(defaultId) || !Object.hasOwn(spec.agent.runtimeValues[name], defaultId)) throw Error('agent_default_invalid');
    const projection = config.projections.find(entry => entry.fact === `self-build.default-${name}`);
    if (!projection || projection.field !== name || fields[name].options?.[String(projection.value)] !== defaultId) throw Error('agent_default_invalid');
  }
}
export function installationDependencies(spec: OperationalInstallationV1) {
  installationShape(spec);
  const credential = credentialResolver(spec), client = new GitHubClient({ credential, requestsPerTick: 256 });
  const adapter = new GitHubIssueFieldsAdapter({ providerId: 'labstride.github.native', configuration: spec.configuration, client, historyQualifications: spec.historyQualifications });
  const rest = new GitHubRest(credential, spec.configuration.github.credentialRef);
  const compiler = { lock: spec.lock, host: spec.host, secrets: { exists: (reference: string) => Boolean(spec.credentials[reference]) }, provider: adapter };
  return { credential, client, adapter, rest, compiler };
}
export async function preflight(spec: OperationalInstallationV1, checkRuntime = true) {
  const dependencies = installationDependencies(spec), compilation = await compileConfiguration(spec.configuration, dependencies.compiler);
  if (!compilation.ok) return { ok: false as const, diagnostics: compilation.diagnostics };
  const providerPin = spec.lock.extensions.find(pin => pin.id === 'labstride.github.native');
  if (!providerPin) throw Error('provider_unavailable');
  await loadExtension(freezeProfile('preflight', compilation.configuration.snapshot.digest, providerPin, spec.host), spec.host,
    { githubReader: dependencies.adapter });
  if (checkRuntime) {
    await dependencies.rest.installationRepositories(spec.policy.repositories.map(repository => repository.id));
    const catalog = await new BridgeClient(spec.agent.bridgeSocket).call({ schemaVersion: '1.0', method: 'catalog' });
    if (catalog.backendVersion !== spec.agent.backendVersion) throw Error('backend_version_mismatch');
    const model = spec.agent.runtimeValues.model[spec.agent.defaults.model], reasoning = spec.agent.runtimeValues.reasoning[spec.agent.defaults.reasoning];
    if (!catalog.models?.some((entry: any) => entry.model === model && entry.reasoning.includes(reasoning))) throw Error('agent_default_unsupported');
    const target = spec.configuration.targets[spec.targetId], pin = spec.lock.extensions.find(pin => pin.id === target?.connector);
    if (!target || !pin) throw Error('target_unavailable');
    const connector = await workspaceTargetResolver(spec.host).resolve(freezeProfile('preflight', compilation.configuration.snapshot.digest, { ...pin, configuration: target.configuration }, spec.host));
    const response = await connector.invoke({ schemaVersion: '2.0', requestId: 'preflight', installationId: spec.configuration.installationId,
      targetId: spec.targetId, targetRevision: target.configuration.revision as number, method: 'probe', includeRoots: true });
    if (response.outcome !== 'ok') throw Error('target_unavailable');
    // The separately administered root mapping must match the protected helper
    // policy; mere ability to run an SSH command cannot establish that mapping.
    const mapping = JSON.parse(readProtected(spec.rootMappingFile).toString('utf8'));
    verifyRootMapping(spec, mapping, response);
  }
  return { ok: true as const, ...dependencies, compiled: compilation.configuration, diagnostics: [] };
}
export function verifyRootMapping(spec: Pick<OperationalInstallationV1, 'sourceRoot' | 'targetId' | 'rootId'>, mapping: any, input: unknown) {
  const proof = validated('ssh-workspace-response', input as import('../../contracts/generated/ssh-workspace-response.ts').TrustedWorkspaceHelperResponseV2);
  const root = proof.roots?.find(root => root.id === spec.rootId);
  if (mapping.schemaVersion !== '1.0' || mapping.sourceRoot !== spec.sourceRoot || mapping.targetId !== spec.targetId || mapping.rootId !== spec.rootId ||
    proof.outcome !== 'ok' || proof.method !== 'probe' || proof.targetId !== spec.targetId || !(proof.capabilities as readonly string[]).includes('workspace.root-map.v1') ||
    !root || root.path !== spec.sourceRoot || !sameIdentity(root.identity, mapping.identity)) throw Error('root_mapping_mismatch');
  // The authenticated helper checks the FULL mount identity in the target's
  // namespace. A systemd sandbox sees another mount ID for that same inode.
  const local = rootIdentity(spec.sourceRoot, mapping.identity.uid);
  if (local.device !== root.identity.device || local.inode !== root.identity.inode || local.uid !== root.identity.uid) throw Error('root_mapping_mismatch');
}
const audit = { actorId: 'local-operator', reason: 'Activate reviewed installed configuration', evidenceRefs: ['installation:owned-file'] };
export async function openOperationalRuntime(spec: OperationalInstallationV1) {
  const checked = await preflight(spec); if (!checked.ok) throw Error('configuration_invalid');
  const authority = createLocalPolicyAuthority();
  assertPrivateDatabase(spec.stateDirectory, 'state.sqlite');
  const runtime = startExecution(spec.stateDirectory, { actions: { executorId: `service:${spec.configuration.installationId}`, nextAttempt: randomUUID, adapters: new Map() },
    observations: { sessions: new Map(), projections: new Map() }, installedTargets: { host: spec.host }, dependencies: { policyAuthority: authority, localWorkspaceRoots: [spec.sourceRoot] } });
  try {
    runtime.store.activateOperationalProfile(checked.compiled, spec.policy, authority, audit);
    await runtime.close();
  } catch (error) { await runtime.close(); throw error; }
  // Adapters capture this exact store instance, so compose after activation and
  // close it with the single execution runtime.
  const execution = startExecution(spec.stateDirectory, { actions: { executorId: `service:${spec.configuration.installationId}`, nextAttempt: randomUUID, adapters: new Map() },
    serialized: true,
    additionalActions: store => new Map([[actionKey('labstride.self-build', '0.1.0'), configuredSelfBuildAction(store, spec, checked.adapter, checked.client, checked.rest)]]),
    observations: { sessions: new Map(), projections: new Map() },
    installedTargets: { host: spec.host }, github: { compiled: checked.compiled, adapter: checked.adapter, buildPlan: (steps, observed) => workspaceStart(checked.compiled, steps, observed) },
    workflowBroker: spec.brokerListener ? { host: spec.host, port: spec.brokerListener.port, provider: new GitHubWorkflowProvider(checked.credential) } : undefined,
    githubMerge: spec.mergeEnabled ? { host: spec.host, provider: new GitHubMergeProvider({ credential: checked.credential,
      identity(reference) {
        const binding = spec.credentials[reference];
        if (!binding || typeof binding === 'string' || binding.permissions.contents !== 'write') return null;
        return { appId: Number(binding.appId), installationId: binding.installationId, repositoryIds: binding.repositoryIds, contents: 'write' };
      } }) } : undefined,
    dependencies: { policyAuthority: authority, localWorkspaceRoots: [spec.sourceRoot] } });
  try { await execution.ready; } catch (error) { await execution.close(); throw error; }
  const store = execution.store;
  return { ...execution, authority,
    async tick() {
      store.advanceWorkflows(spec.host);
      await execution.tick(); await execution.drain();
      for (const run of store.runs()) {
        try { await publishRunSummary(store, run.id, checked.rest, checked.client); }
        catch { store.summaryError(run.id, 'summary_observation_failed'); }
      }
      for (const pr of store.pullRequests()) {
        store.deferPullRequest(pr.runId);
        try {
          const run = store.get('run', pr.runId), config = store.runConfiguration(run.id)!;
          const source = store.operations(run.id)[0].request.source;
          const current = await checked.rest.request('GET', `/repos/${source.repository}/pulls/${pr.number}`);
          if (current.head?.sha !== pr.sha) { store.workflowError(run.id, 'pull_request_changed'); continue; }
          if (current.merged && config) {
            const issue = store.get('request', run.requestId).issueId, item = await checked.adapter.withConfiguration(config.configuration).item(issue);
            if (item) store.enqueueGitHubProgress(run.id, 'self-build.merged', item);
            store.managedRunComplete(run.id);
          }
        } catch { store.workflowError(pr.runId, 'pull_request_observation_failed'); }
      }
    },
  };
}

export function inspectDatabase(directory: string) {
  assertPrivateDatabase(directory, 'state.sqlite');
  const db = new DatabaseSync(join(directory, 'state.sqlite'), { readOnly: true });
  try { return { schemaVersion: Number(db.prepare('PRAGMA user_version').get()!.user_version), expectedSchemaVersion: migrations.length,
    integrity: db.prepare('PRAGMA quick_check').get(), runs: Number(db.prepare('SELECT count(*) AS n FROM runs').get()!.n) }; }
  finally { db.close(); }
}
export async function backupDatabase(directory: string, destination: string) {
  assertPrivateDatabase(directory, 'state.sqlite');
  try { lstatSync(destination); throw Error('backup_exists'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  protectedPath(dirname(destination));
  writeFileSync(destination, '', { flag: 'wx', mode: 0o600 }); // Parent exists and is operator-owned.
  const db = new DatabaseSync(join(directory, 'state.sqlite'), { readOnly: true });
  try { await backup(db, destination); } finally { db.close(); }
}
