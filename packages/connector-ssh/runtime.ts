import { loadExtension, freezeProfile, ExtensionError } from '../extensions/loader.ts';
import type { HostProfile, Profile } from '../extensions/loader.ts';
import type { RecordOf } from '../core/lifecycle.ts';
import type { ActionAdapter, BoundResult } from '../core/execution.ts';
import type { ConfigurationSnapshot } from '../configuration/snapshot.ts';
import { checkedSnapshot } from '../configuration/snapshot.ts';
import { validated } from '../storage-sqlite/validation.ts';
import { digest } from '../storage-sqlite/execution.ts';
import { locatorFor, reserveAction, reserveVersion } from '../target-helper/registry.ts';
import type { HelperRequest, HelperResponse } from '../target-helper/registry.ts';
import { TargetError } from '../target-helper/filesystem.ts';

export interface TargetConnector { validate(request: HelperRequest): void | Promise<void>; invoke(request: HelperRequest): Promise<HelperResponse> }
export function targetResolver(host: HostProfile) {
  const instances = new Map<string, Promise<TargetConnector>>();
  return {
    resolve(profile: Profile): Promise<TargetConnector> {
      const key = digest(profile);
      let instance = instances.get(key);
      if (!instance) {
        instance = (async () => {
          if (profile.pin.id !== 'labstride.connector.ssh' || profile.pin.kind !== 'connector') throw new ExtensionError('identity_mismatch');
          const loaded = await loadExtension(profile, host), raw = loaded.instance as TargetConnector;
          if (!raw || typeof raw.validate !== 'function' || typeof raw.invoke !== 'function') throw new ExtensionError('identity_mismatch');
          const safe = (error: unknown): never => {
            const message = error instanceof Error ? error.message : '';
            const code = ['forbidden','identity_mismatch','configuration_invalid','unsupported_capability','resource_busy','outcome_unknown','operation_failed','authentication_failed','transient_unavailable'].includes(message)
              ? message as TargetError['code'] : 'validation_failed';
            throw new TargetError(code);
          };
          const validate = async (request: HelperRequest) => {
            validated('ssh-helper-request', request); loaded.checkInput(request);
            if (!profile.capabilities.includes(`target.${request.method}.v1`)) throw new ExtensionError('unsupported_capability');
            try { await raw.validate(request); } catch (error) { safe(error); }
          };
          return { validate, async invoke(request: HelperRequest) {
            await validate(request);
            let response;
            try { response = await raw.invoke(structuredClone(request)); } catch (error) { safe(error); }
            const reply = validated<HelperResponse>('ssh-helper-response', response!);
            loaded.checkOutput(reply);
            for (const key of ['schemaVersion','requestId','installationId','targetId','targetRevision','method'] as const)
              if (reply[key] !== request[key]) throw new ExtensionError('identity_mismatch');
            if (reply.reservation && request.operation) {
              for (const key of ['runId','workspaceId','operationId','requestDigest'] as const)
                if (reply.reservation[key] !== request.operation[key]) throw new ExtensionError('identity_mismatch');
              if (reply.reservation.installationId !== request.installationId || reply.reservation.targetId !== request.targetId ||
                reply.reservation.targetRevision !== request.targetRevision || reply.reservation.rootId !== request.operation.inputs.rootId ||
                reply.reservation.locator !== locatorFor(request.installationId, request.targetId, request.operation.workspaceId))
                throw new ExtensionError('identity_mismatch');
            }
            return { ...reply, capabilities: reply.capabilities.filter(capability => profile.capabilities.includes(capability)) as HelperResponse['capabilities'] };
          } };
        })();
        instances.set(key, instance); instance.catch(() => instances.delete(key));
      }
      return instance;
    },
  };
}
export function createTargetReservationAction(resolve: (operation: RecordOf<'operation'>['request']) => Promise<{ connector: TargetConnector; installationId: string; revision: number }>): ActionAdapter {
  const request = (op: RecordOf<'operation'>['request'], installationId: string, revision: number, method: 'reserve' | 'inspect'): HelperRequest =>
    validated('ssh-helper-request', { schemaVersion: '1.0', requestId: op.operationId, installationId, targetId: op.targetId!, targetRevision: revision, method, operation: op });
  async function call(op: RecordOf<'operation'>['request'], method: 'reserve' | 'inspect'): Promise<BoundResult> {
    const { connector, installationId, revision } = await resolve(op);
    const reply = await connector.invoke(request(op, installationId, revision, method));
    // Failure to inspect is not authoritative evidence that the original effect
    // failed. The worker keeps its original unknown operation and read retries.
    if (method === 'inspect' && reply.outcome === 'error') throw new TargetError('outcome_unknown');
    return { schemaVersion: '1.0', kind: 'result', operationId: op.operationId, requestDigest: op.requestDigest,
      result: { status: reply.outcome === 'ok' ? 'succeeded' : reply.outcome === 'error' ? 'failed' : 'outcome_unknown',
        handle: op.operationId, resources: [], outputs: reply.reservation ? { reservation: reply.reservation } : {},
        evidenceRefs: [`target:registry:${op.operationId}`], error: reply.error } };
  }
  return {
    async validate(op) {
      validated('operation', op);
      if (op.actionId !== reserveAction || op.actionVersion !== reserveVersion) throw new ExtensionError('unsupported_capability');
      const { connector, installationId, revision } = await resolve(op);
      await connector.validate(request(op, installationId, revision, 'reserve'));
    },
    start: op => call(op, 'reserve'),
    reconcile: op => call(op, 'inspect'),
  };
}
// Run snapshots, not current installation settings, choose connector profiles.
export function configuredTargetAction(store: { runConfiguration(runId: string): ConfigurationSnapshot | null }, host: HostProfile) {
  const resolver = targetResolver(host);
  return createTargetReservationAction(async op => {
    const saved = store.runConfiguration(op.runId);
    if (!saved) throw new ExtensionError('configuration_invalid');
    const snapshot = checkedSnapshot(saved), target = snapshot.configuration.targets[op.targetId ?? ''];
    const pin = snapshot.extensionLock.extensions.find(pin => pin.id === target?.connector);
    if (op.configDigest !== snapshot.digest || !target || !pin || pin.kind !== 'connector') throw new ExtensionError('identity_mismatch');
    const profile = freezeProfile(op.runId, snapshot.digest, { ...pin, configuration: target.configuration }, host);
    const revision = target.configuration.revision;
    if (typeof revision !== 'number') throw new ExtensionError('configuration_invalid');
    return { connector: await resolver.resolve(profile), installationId: snapshot.configuration.installationId, revision };
  });
}
