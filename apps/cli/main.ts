#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { loadInstallation, installationShape, preflight, openOperationalRuntime, inspectDatabase, backupDatabase } from '../../packages/operations/runtime.ts';
import { acquireServiceLock, serviceLoop } from '../../packages/operations/loop.ts';
import { createLocalPolicyAuthority } from '../../packages/core/policy.ts';
import { WorkflowStore } from '../../packages/storage-sqlite/workflows.ts';
import { serveBridge } from '../../packages/operations/bridge.ts';
import { readProtected } from '../../packages/target-helper/filesystem.ts';

export async function cli(argv: string[], output: (value: unknown) => void = value => process.stdout.write(JSON.stringify(value) + '\n')) {
  const args = [...argv], configIndex = args.indexOf('--config');
  let path = '/etc/labstride/installation.json';
  if (configIndex >= 0) { if (!args[configIndex + 1]) throw Error('usage'); path = resolve(args[configIndex + 1]); args.splice(configIndex, 2); }
  const json = args.indexOf('--json'); if (json >= 0) args.splice(json, 1);
  if (args[0] === 'init' && args.length === 2) {
    const example = readFileSync(new URL('../../examples/operational-installation.json', import.meta.url));
    writeFileSync(args[1], example, { mode: 0o600, flag: 'wx' }); output({ schemaVersion: '1.0', enabled: false, code: 'configure_before_activation' }); return;
  }
  if (args[0] === 'bridge' && args.length === 2) {
    const policy = JSON.parse(readProtected(resolve(args[1])).toString('utf8'));
    const bridge = await serveBridge(policy), controller = new AbortController();
    const stop = () => controller.abort(); process.once('SIGTERM', stop); process.once('SIGINT', stop);
    try { await new Promise<void>(resolve => controller.signal.addEventListener('abort', () => resolve(), { once: true })); }
    finally { await bridge.close(); process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop); } return;
  }
  const spec = loadInstallation(path);
  installationShape(spec);
  if (args[0] === 'config' && args[1] === 'validate' && args.length === 2) {
    const checked = await preflight(spec, false); output({ schemaVersion: '1.0', ok: checked.ok, diagnostics: checked.diagnostics });
    if (!checked.ok) process.exitCode = 1; return;
  }
  if (args[0] === 'doctor' && args.length === 1) {
    const checks: { name: string; ok: boolean; code?: string; details?: unknown }[] = [];
    try { const checked = await preflight(spec); checks.push({ name: 'provider_target_agent', ok: checked.ok, details: checked.diagnostics }); }
    catch (error) { checks.push({ name: 'provider_target_agent', ok: false, code: safeCode(error) }); }
    try { const database = inspectDatabase(spec.stateDirectory); checks.push({ name: 'database', ok: database.schemaVersion === database.expectedSchemaVersion && Object.values(database.integrity ?? {})[0] === 'ok', details: database }); }
    catch (error) { checks.push({ name: 'database', ok: false, code: safeCode(error) }); }
    output({ schemaVersion: '1.0', ok: checks.every(check => check.ok), enabled: spec.configuration.enabled, installedRevision: spec.revision, checks });
    if (checks.some(check => !check.ok)) process.exitCode = 1; return;
  }
  if (args[0] === 'backup' && args.length === 2) {
    await backupDatabase(spec.stateDirectory, args[1]); output({ schemaVersion: '1.0', code: 'backup_created', restoreRequiresReconciliation: true }); return;
  }
  if (args[0] === 'serve' && args.length === 1) {
    const release = await acquireServiceLock(spec.stateDirectory), controller = new AbortController();
    const stop = () => controller.abort(); process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try { const runtime = await openOperationalRuntime(spec); await serviceLoop(runtime, controller.signal); }
    finally { await release(); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); } return;
  }
  if (args[0] === 'runs') {
    const authority = createLocalPolicyAuthority(), store = new WorkflowStore(spec.stateDirectory, { policyAuthority: authority, localWorkspaceRoots: [spec.sourceRoot] });
    try {
      const view = (id: string) => ({ ...store.controlStatus(id), diagnostic: store.workflowDiagnostic(id), summaryDiagnostic: store.summaryDiagnostic(id), fieldConflicts: store.managedProjectionDiagnostics(id), session: store.managedSession(id), startup: store.operations(id).filter(op => op.request.actionId === 'labstride.self-build').map(op => store.managedSessionStart(op.id)).filter(Boolean) });
      if (args[1] === 'list' && args.length === 2) { output({ schemaVersion: '1.0', runs: store.runs().map(run => view(run.id)) }); return; }
      if (args[1] === 'show' && args.length === 3) { output(view(args[2])); return; }
      if (['pause', 'resume', 'cancel', 'reconcile'].includes(args[1]) && args.length === 3) {
        const run = store.get('run', args[2]), context = { actorId: 'local-operator', reason: `CLI ${args[1]}`, evidenceRefs: ['operator:local-file-authority'] };
        if (args[1] === 'reconcile') {
          for (const op of store.operations(run.id)) {
            const delivery = store.delivery(`operation:${op.id}`);
            if (['blocked', 'conflict'].includes(delivery.state)) {
              if (delivery.state === 'conflict') continue; // Conflicting evidence is never cleared by a generic reconcile.
              store.resumeObservation(delivery.id, context);
            }
          }
        } else {
          const command = args[1] as 'pause' | 'resume' | 'cancel';
          const input = { schemaVersion: '1.0' as const, id: `control:${randomUUID()}`, runId: run.id, expectedRevision: run.revision, command };
          if (command === 'pause') store.pauseRun(input, context, authority);
          else if (command === 'resume') store.resumeRun(input, context, authority);
          else store.cancelRun(input, context, authority);
        }
        output(view(run.id)); return;
      }
    } finally { store.close(); }
  }
  throw Error('usage');
}
export function safeCode(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : error instanceof Error ? error.message : '';
  return /^[a-z_]{1,100}$/.test(code) ? code : 'operation_failed';
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.umask(0o077);
  cli(process.argv.slice(2)).catch(error => { process.stderr.write(JSON.stringify({ schemaVersion: '1.0', code: safeCode(error) }) + '\n'); process.exitCode = 1; });
}
