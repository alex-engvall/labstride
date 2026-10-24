import { freezeProfile, loadExtension, ExtensionError } from '../extensions/loader.ts';
import type { HostProfile } from '../extensions/loader.ts';
import type { CleanupStore } from '../storage-sqlite/cleanup.ts';
import type { CleanupContext } from '../core/cleanup-worker.ts';
import type { TrustedCleanupInspectionRequestV4 } from '../../contracts/generated/ssh-cleanup-request.ts';
export function configuredCleanupInspection(store: CleanupStore, host: HostProfile) {
  return async (request: TrustedCleanupInspectionRequestV4, context: CleanupContext): Promise<unknown> => {
    const snapshot = store.runConfiguration(context.run.id)!, target = snapshot.configuration.targets[request.targetId];
    const pin = snapshot.extensionLock.extensions.find(pin => pin.id === target?.connector && pin.kind === 'connector');
    if (!pin?.capabilities.includes('cleanup.inspect.v1')) throw new ExtensionError('unsupported_capability');
    const loaded = await loadExtension(freezeProfile(context.run.id, snapshot.digest, { ...pin, configuration: target.configuration }, host), host);
    const connector = loaded.instance as { validate(input: unknown): Promise<void>; invoke(input: unknown): Promise<unknown> };
    loaded.checkInput(request); await connector.validate(request);
    const response = await connector.invoke(request); loaded.checkOutput(response); return response;
  };
}

export function configuredCleanupDeletion(store: CleanupStore, host: HostProfile) {
  return async (request: import('../../contracts/generated/ssh-cleanup-delete-request.ts').TrustedCleanupDeletionRequestV5, context: CleanupContext): Promise<unknown> => {
    const snapshot = store.runConfiguration(context.run.id)!, target = snapshot.configuration.targets[request.targetId];
    const pin = snapshot.extensionLock.extensions.find(pin => pin.id === target?.connector && pin.kind === 'connector');
    if (!pin?.capabilities.includes('cleanup.delete.v1')) throw new ExtensionError('unsupported_capability');
    const loaded = await loadExtension(freezeProfile(context.run.id, snapshot.digest, { ...pin, configuration: target.configuration }, host), host);
    const connector = loaded.instance as { validate(input: unknown): Promise<void>; invoke(input: unknown): Promise<unknown> };
    loaded.checkInput(request); await connector.validate(request);
    if(request.method==='commit')store.assertCleanupCommitAllowed(context.cleanupRequestId,request.authorization);
    const response = await connector.invoke(request); loaded.checkOutput(response); return response;
  };
}
