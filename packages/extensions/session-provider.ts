import { loadExtension, ExtensionError } from './loader.ts';
import type { HostProfile, Profile } from './loader.ts';
import type { SessionProvider, SessionRequest, SessionReply } from '../core/sessions.ts';
import { validated } from '../storage-sqlite/validation.ts';
import { digest } from '../storage-sqlite/execution.ts';
import { LifecycleError } from '../core/lifecycle.ts';

export function sessionResolver(host: HostProfile) {
  const instances = new Map<string, Promise<SessionProvider>>();
  async function load(profile: Profile): Promise<SessionProvider> {
    const loaded = await loadExtension(profile, host), raw = loaded.instance as SessionProvider;
    if (!raw || typeof raw.backendIdentity !== 'string' || !raw.backendIdentity || typeof raw.atomicSessionGuards !== 'boolean' ||
      typeof raw.hooks !== 'boolean' || ['invoke','reconcile','validate'].some(key => typeof raw[key as keyof SessionProvider] !== 'function') ||
      raw.atomicSessionGuards !== profile.capabilities.includes('session.atomic-guards.v1') ||
      raw.hooks !== profile.capabilities.includes('session.hooks.v1')) throw new ExtensionError('identity_mismatch');
    const validate = async (request: SessionRequest) => {
      validated('session-request', request);
      if (request.providerId !== profile.pin.id) throw new ExtensionError('identity_mismatch');
      validated('contract-request', { schemaVersion: '1.0', requestId: request.operationId, extensionId: request.providerId,
        protocol: profile.protocol, family: 'session-provider', method: request.command, input: request });
      loaded.checkInput(request);
      try { await raw.validate(structuredClone(request)); }
      catch (error) {
        if (error instanceof Error && error.message === 'unsupported_capability') throw new LifecycleError('unsupported_capability');
        throw error;
      }
    };
    const call = async (method: 'invoke' | 'reconcile', request: SessionRequest): Promise<SessionReply> => {
      await validate(request);
      const reply = validated<SessionReply>('session-reply', await raw[method](structuredClone(request)));
      if (reply.outcome === 'ok') {
        loaded.checkOutput(reply.observation);
        if (reply.observation.providerId !== request.providerId || reply.observation.workspaceId !== request.workspaceId ||
          (request.command !== 'start' && reply.observation.sessionId !== request.sessionId)) throw new ExtensionError('identity_mismatch');
        validated('contract-result', { schemaVersion: '1.0', requestId: request.operationId, extensionId: request.providerId,
          protocol: profile.protocol, family: 'session-provider', method: request.command, outcome: 'ok', result: reply.observation, error: null });
      }
      return reply;
    };
    return { backendIdentity: raw.backendIdentity, atomicSessionGuards: raw.atomicSessionGuards, hooks: raw.hooks, validate,
      invoke: request => call('invoke', request), reconcile: request => call('reconcile', request), dispose: () => raw.dispose?.() };
  }
  return { resolve(profile: Profile) {
    const key = digest(profile);
    let instance = instances.get(key);
    if (!instance) { instance = load(profile); instances.set(key, instance); instance.catch(() => instances.delete(key)); }
    return instance;
  }, async close() { for (const pending of instances.values()) { try { (await pending).dispose?.(); } catch { /* A failed load owns no usable adapter. */ } } instances.clear(); } };
}
