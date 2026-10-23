import type { LabstrideSessionCommandV1 } from '../../contracts/generated/session-request.ts';
import type { SessionObservation } from './observations.ts';
import type { Profile } from '../extensions/loader.ts';
import type { RecordOf } from './lifecycle.ts';
import type { ActionAdapter, BoundResult } from './execution.ts';
export type SessionRequest = LabstrideSessionCommandV1;
export type SessionFailure = 'stale_revision' | 'unsupported_capability' | 'identity_mismatch' | 'validation_failed' | 'forbidden';
export type SessionReply = { schemaVersion: '1.0' } & ({ outcome: 'ok'; observation: SessionObservation } |
  { outcome: 'error'; code: SessionFailure; evidenceRefs: string[] } |
  { outcome: 'outcome_unknown'; evidenceRefs: string[] });
export interface SessionProvider {
  readonly backendIdentity: string;
  readonly atomicSessionGuards: boolean;
  readonly hooks: boolean;
  validate(request: SessionRequest): void | Promise<void>;
  invoke(request: SessionRequest): Promise<SessionReply>;
  // Must not repeat a possibly completed command. Observe a receipt or preserve uncertainty.
  reconcile(request: SessionRequest): Promise<SessionReply>;
  dispose?(): void;
}
export interface SessionCommand { schemaVersion: '1.0'; enrollmentId: string; backendIdentity: string; profileDigest: string; request: SessionRequest }
export const sessionAction = 'labstride.session-command';
export const sessionActionVersion = '1.0.0';
export function bindCommand(operation: RecordOf<'operation'>, command: SessionCommand): RecordOf<'operation'> {
  return { ...operation, request: { ...operation.request, actionId: sessionAction, actionVersion: sessionActionVersion,
    inputs: { sessionCommand: structuredClone(command) } } };
}
export interface SessionCommandPort {
  command(operationId: string): SessionCommand;
  profile(runId: string, providerId: string): Profile;
  recordSessionReply(operationId: string, response: SessionReply): void;
  savedSessionReply(operationId: string): SessionReply | null;
}
export function createSessionAction(store: SessionCommandPort, resolve: (profile: Profile) => Promise<SessionProvider>): ActionAdapter {
  async function provider(operation: RecordOf<'operation'>['request']) {
    const command = store.command(operation.operationId), profile = store.profile(operation.runId, command.request.providerId);
    const instance = await resolve(profile);
    if (instance.backendIdentity !== command.backendIdentity) throw new Error('identity_mismatch');
    return { command, instance };
  }
  const bound = (op: RecordOf<'operation'>['request'], reply: SessionReply): BoundResult => ({
    schemaVersion: '1.0', kind: 'result', operationId: op.operationId, requestDigest: op.requestDigest,
    result: { status: reply.outcome === 'ok' ? 'succeeded' : reply.outcome === 'error' ? 'failed' : 'outcome_unknown',
      handle: store.command(op.operationId).enrollmentId, resources: [],
      outputs: reply.outcome === 'ok' ? { observation: reply.observation } : {},
      evidenceRefs: reply.outcome === 'ok' ? reply.observation.evidenceRefs : reply.evidenceRefs,
      error: reply.outcome === 'ok' ? null : { code: reply.outcome === 'error' ? reply.code : 'outcome_unknown',
        message: reply.outcome === 'error' ? reply.code : 'Session command requires reconciliation',
        retryClass: reply.outcome === 'error' ? 'none' : 'reconcile', evidenceId: 'session:command' } },
  });
  return {
    // Command-specific guard checks happen in SessionStore before the existing effect boundary.
    atomicSessionGuards: true,
    async validate(op) { const { command, instance } = await provider(op); await instance.validate(command.request); },
    async start(op) {
      const { command, instance } = await provider(op);
      const reply = await instance.invoke(structuredClone(command.request));
      store.recordSessionReply(op.operationId, reply);
      return bound(op, reply);
    },
    async reconcile(op) {
      const { command, instance } = await provider(op);
      const saved = store.savedSessionReply(op.operationId);
      const reply = saved && saved.outcome !== 'outcome_unknown' ? saved : await instance.reconcile(structuredClone(command.request));
      store.recordSessionReply(op.operationId, reply);
      return bound(op, reply);
    },
  };
}
