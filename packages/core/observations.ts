import type { LabstrideHookObservation } from '../../contracts/generated/hook-observation.ts';
import type { LabstrideSessionObservationV1 } from '../../contracts/generated/session-observation.ts';
import type { ProjectionObservation } from '../../contracts/generated/projection-observation.ts';
import type { AuditContext, RecordOf } from './lifecycle.ts';
import type { Delivery, RetryPolicy } from './execution.ts';
export type Hook = LabstrideHookObservation;
export type SessionObservation = LabstrideSessionObservationV1;
export type ProjectionView = ProjectionObservation;
export interface SessionPoll { sessionId: string; revision: number; nextAt: string; attempts: number; blocked: boolean }
export interface SessionObserver { observe(session: RecordOf<'session'>): Promise<SessionObservation> }
export interface ProjectionAdapter {
  atomicPrecondition: boolean;
  read(projection: RecordOf<'projection'>, token: string | null): Promise<ProjectionView>;
  // Must atomically bind generation AND field version. A pre-read alone does not implement this guarantee.
  write(projection: RecordOf<'projection'>, token: string): Promise<ProjectionView>;
}
export interface ObservationPort {
  projectionAllowed(runId: string): boolean;
  get<K extends import('./lifecycle.ts').Kind>(kind: K, id: string): RecordOf<K>;
  receiveHook(enrollmentId: string, hook: Hook): import('../../contracts/generated/hook-ack.ts').LabstrideHookAcknowledgement;
  bootObservations(): void;
  dueSessions(): SessionPoll[];
  applySession(poll: SessionPoll, expectedRevision: number, observation: SessionObservation, intervalMs: number, projections?: RecordOf<'projection'>[]): void;
  retrySession(poll: SessionPoll, policy: RetryPolicy, random: number): void;
  dueProjections(): Delivery[];
  delivery(id: string): Delivery;
  projectionToken(id: string): string | null;
  inspectProjection(id: string, expectedRevision: number, view: ProjectionView): 'write' | 'wait' | 'finished';
  beginProjection(id: string, expectedRevision: number, view: ProjectionView): string;
  projectionNotApplied(id: string, token: string): void;
  retryRead(id: string, policy: RetryPolicy, random: number): void;
  block(id: string, code: string): void;
  resumeObservation(id: string, context: AuditContext): void;
}
