import type { LabstrideContractRequest } from '../../contracts/generated/contract-request.js';
import type { LabstrideContractResult } from '../../contracts/generated/contract-result.js';
import type { LabstrideHookObservation } from '../../contracts/generated/hook-observation.js';
import type { LabstrideHookAcknowledgement } from '../../contracts/generated/hook-ack.js';

function inspect(request: LabstrideContractRequest, result: LabstrideContractResult,
                 hook: LabstrideHookObservation, ack: LabstrideHookAcknowledgement) {
  if (request.family === 'provider' && request.method === 'readSnapshot') {
    const subject: string = request.input.subjectId;
    // @ts-expect-error Provider snapshot input has no shell command.
    request.input.shell;
    void subject;
  }
  if (result.family === 'connector' && result.method === 'execute' && result.outcome === 'ok') {
    // @ts-expect-error Direct result is not a GitHub Actions workflow receipt.
    result.result.executor;
  }
  if (ack.outcome === 'accepted') {
    const persistence: 'durable' = ack.persistence;
    void persistence;
  }
  // @ts-expect-error Advisory hooks do not grant plan approval.
  const forbiddenKind: LabstrideHookObservation['kind'] = 'plan.approved';
  void hook; void forbiddenKind;
}
void inspect;
