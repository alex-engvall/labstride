/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export type LabstrideContractResult =
  | ProviderCapabilitiesSuccess
  | ProviderReadSnapshotSuccess
  | ProviderSubscribeSuccess
  | ProviderReconcileSuccess
  | ProviderProjectSuccess
  | ProvidererrorResponse
  | ProvideroutcomeUnknownResponse
  | ConnectorProbeSuccess
  | ConnectorExecuteSuccess
  | ConnectorUploadSuccess
  | ConnectorDownloadSuccess
  | ConnectorInspectSuccess
  | ConnectorCancelSuccess
  | ConnectorerrorResponse
  | ConnectoroutcomeUnknownResponse
  | ActionDescribeSuccess
  | ActionValidateSuccess
  | ActionStartSuccess
  | ActionObserveSuccess
  | ActionCancelSuccess
  | ActionReconcileSuccess
  | ActionerrorResponse
  | ActionoutcomeUnknownResponse
  | SessionProviderCapabilitiesSuccess
  | SessionProviderStartSuccess
  | SessionProviderResumeSuccess
  | SessionProviderObserveSuccess
  | SessionProviderSendSuccess
  | SessionProviderInterruptSuccess
  | SessionProviderCloseSuccess
  | SessionProvidererrorResponse
  | SessionProvideroutcomeUnknownResponse;
export type Error = {
  code:
    | "validation_failed"
    | "forbidden"
    | "unsupported_capability"
    | "authentication_failed"
    | "identity_mismatch"
    | "stale_revision"
    | "policy_changed"
    | "resource_busy"
    | "rate_limited"
    | "transient_unavailable"
    | "configuration_invalid"
    | "projection_conflict"
    | "operation_failed"
    | "cancelled"
    | "outcome_unknown";
  message: string;
  evidenceId: string | null;
  retryClass: "none" | "read_only" | "pre_effect_transient" | "reconcile";
};
export type ActionReconcileOutput = {
  status: "accepted" | "succeeded" | "failed" | "cancelled" | "outcome_unknown" | "superseded";
  handle: string | null;
  /**
   * @maxItems 128
   */
  resources: Resource[];
  /**
   * @maxItems 128
   */
  evidenceRefs: string[];
  outputs: {
    [k: string]: unknown;
  };
  error: Error | null;
};

export interface ProviderCapabilitiesSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "provider";
  method: "capabilities";
  outcome: "ok";
  result: SessionProviderCapabilitiesOutput;
  error: null;
}
export interface Protocol {
  major: 1;
  minor: number;
}
export interface SessionProviderCapabilitiesOutput {
  protocol: Protocol;
  /**
   * @maxItems 128
   */
  capabilities: string[];
}
export interface ProviderReadSnapshotSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "provider";
  method: "readSnapshot";
  outcome: "ok";
  result: ProviderReconcileOutput;
  error: null;
}
export interface ProviderReconcileOutput {
  subjectId: string;
  sourceVersion: string;
  actorId: string | null;
  observedAt: string;
  fields: {
    [k: string]: unknown;
  };
}
export interface ProviderSubscribeSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "provider";
  method: "subscribe";
  outcome: "ok";
  result: ProviderSubscribeOutput;
  error: null;
}
export interface ProviderSubscribeOutput {
  /**
   * @maxItems 100
   */
  events: LabstrideNormalizedEventV1[];
  nextCursor: string | null;
}
export interface LabstrideNormalizedEventV1 {
  schemaVersion: "1.0";
  eventId: string;
  installationId: string;
  provider: string;
  kind: string;
  origin: "human" | "provider" | "coordinator" | "extension";
  externalId: string;
  subjectId: string;
  actorId: string;
  occurredAt: string;
  observedAt: string;
  sourceVersion: string;
  facts: {
    [k: string]: unknown;
  };
}
export interface ProviderReconcileSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "provider";
  method: "reconcile";
  outcome: "ok";
  result: ProviderReconcileOutput;
  error: null;
}
export interface ProviderProjectSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "provider";
  method: "project";
  outcome: "ok";
  result: ProviderProjectOutput;
  error: null;
}
export interface ProviderProjectOutput {
  subjectId: string;
  sourceVersion: string;
}
export interface ProvidererrorResponse {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "provider";
  method: "capabilities" | "readSnapshot" | "subscribe" | "reconcile" | "project";
  outcome: "error";
  result: null;
  error: Error;
}
export interface ProvideroutcomeUnknownResponse {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "provider";
  method: "capabilities" | "readSnapshot" | "subscribe" | "reconcile" | "project";
  outcome: "outcome_unknown";
  result: null;
  error: Error & {
    code?: "outcome_unknown";
    [k: string]: unknown;
  };
}
export interface ConnectorProbeSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "connector";
  method: "probe";
  outcome: "ok";
  result: ConnectorProbeOutput;
  error: null;
}
export interface ConnectorProbeOutput {
  targetId: string;
  /**
   * @maxItems 128
   */
  capabilities: string[];
  /**
   * @maxItems 128
   */
  evidenceRefs: string[];
}
export interface ConnectorExecuteSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "connector";
  method: "execute";
  outcome: "ok";
  result: ActionReconcileOutput;
  error: null;
}
export interface Resource {
  type: string;
  id: string;
  state: string;
}
export interface ConnectorUploadSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "connector";
  method: "upload";
  outcome: "ok";
  result: ActionReconcileOutput;
  error: null;
}
export interface ConnectorDownloadSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "connector";
  method: "download";
  outcome: "ok";
  result: ActionReconcileOutput;
  error: null;
}
export interface ConnectorInspectSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "connector";
  method: "inspect";
  outcome: "ok";
  result: ActionReconcileOutput;
  error: null;
}
export interface ConnectorCancelSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "connector";
  method: "cancel";
  outcome: "ok";
  result: ActionReconcileOutput;
  error: null;
}
export interface ConnectorerrorResponse {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "connector";
  method: "probe" | "execute" | "upload" | "download" | "inspect" | "cancel";
  outcome: "error";
  result: null;
  error: Error;
}
export interface ConnectoroutcomeUnknownResponse {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "connector";
  method: "probe" | "execute" | "upload" | "download" | "inspect" | "cancel";
  outcome: "outcome_unknown";
  result: null;
  error: Error & {
    code?: "outcome_unknown";
    [k: string]: unknown;
  };
}
export interface ActionDescribeSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "action";
  method: "describe";
  outcome: "ok";
  result: ActionDescribeOutput;
  error: null;
}
export interface ActionDescribeOutput {
  id: string;
  version: string;
  inputSchema: string;
  outputSchema: string;
  /**
   * @maxItems 128
   */
  capabilities: string[];
}
export interface ActionValidateSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "action";
  method: "validate";
  outcome: "ok";
  result: ActionValidateOutput;
  error: null;
}
export interface ActionValidateOutput {
  normalizedInputs: {
    [k: string]: unknown;
  };
}
export interface ActionStartSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "action";
  method: "start";
  outcome: "ok";
  result: ActionReconcileOutput;
  error: null;
}
export interface ActionObserveSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "action";
  method: "observe";
  outcome: "ok";
  result: ActionReconcileOutput;
  error: null;
}
export interface ActionCancelSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "action";
  method: "cancel";
  outcome: "ok";
  result: ActionReconcileOutput;
  error: null;
}
export interface ActionReconcileSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "action";
  method: "reconcile";
  outcome: "ok";
  result: ActionReconcileOutput;
  error: null;
}
export interface ActionerrorResponse {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "action";
  method: "describe" | "validate" | "start" | "observe" | "cancel" | "reconcile";
  outcome: "error";
  result: null;
  error: Error;
}
export interface ActionoutcomeUnknownResponse {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "action";
  method: "describe" | "validate" | "start" | "observe" | "cancel" | "reconcile";
  outcome: "outcome_unknown";
  result: null;
  error: Error & {
    code?: "outcome_unknown";
    [k: string]: unknown;
  };
}
export interface SessionProviderCapabilitiesSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "session-provider";
  method: "capabilities";
  outcome: "ok";
  result: SessionProviderCapabilitiesOutput;
  error: null;
}
export interface SessionProviderStartSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "session-provider";
  method: "start";
  outcome: "ok";
  result: LabstrideSessionObservationV1;
  error: null;
}
export interface LabstrideSessionObservationV1 {
  schemaVersion: "1.0";
  workspaceId: string;
  providerId: string;
  sessionId: string;
  state: "ready" | "busy" | "waiting_human" | "closed" | "failed" | "outcome_unknown";
  lastTurnId: string | null;
  humanActivityRevision: number;
  effectiveSettings: {
    [k: string]: unknown;
  };
  /**
   * @minItems 0
   */
  evidenceRefs: string[];
}
export interface SessionProviderResumeSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "session-provider";
  method: "resume";
  outcome: "ok";
  result: LabstrideSessionObservationV1;
  error: null;
}
export interface SessionProviderObserveSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "session-provider";
  method: "observe";
  outcome: "ok";
  result: LabstrideSessionObservationV1;
  error: null;
}
export interface SessionProviderSendSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "session-provider";
  method: "send";
  outcome: "ok";
  result: LabstrideSessionObservationV1;
  error: null;
}
export interface SessionProviderInterruptSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "session-provider";
  method: "interrupt";
  outcome: "ok";
  result: LabstrideSessionObservationV1;
  error: null;
}
export interface SessionProviderCloseSuccess {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "session-provider";
  method: "close";
  outcome: "ok";
  result: LabstrideSessionObservationV1;
  error: null;
}
export interface SessionProvidererrorResponse {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "session-provider";
  method: "capabilities" | "start" | "resume" | "observe" | "send" | "interrupt" | "close";
  outcome: "error";
  result: null;
  error: Error;
}
export interface SessionProvideroutcomeUnknownResponse {
  schemaVersion: "1.0";
  requestId: string;
  extensionId: string;
  protocol: Protocol;
  family: "session-provider";
  method: "capabilities" | "start" | "resume" | "observe" | "send" | "interrupt" | "close";
  outcome: "outcome_unknown";
  result: null;
  error: Error & {
    code?: "outcome_unknown";
    [k: string]: unknown;
  };
}
