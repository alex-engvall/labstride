import type { CleanupPolicyV1 } from '../../contracts/generated/cleanup-policy.ts';
import type { CleanupDecisionV1 } from '../../contracts/generated/cleanup-decision.ts';
import type { TrustedCleanupInspectionRequestV4 } from '../../contracts/generated/ssh-cleanup-request.ts';
const policy: CleanupPolicyV1 = { schemaVersion:'1.0',trigger:'operator_request',actionId:'example.cleanup',actionVersion:'1.0.0',completion:'merge_only',regenerableIgnoredPaths:[] };
// @ts-expect-error Agent completion observations cannot become cleanup policy.
const unsupported: CleanupPolicyV1['completion'] = 'session_stopped';
// @ts-expect-error The inspection protocol exposes no deletion method.
const destructive: TrustedCleanupInspectionRequestV4['method'] = 'delete';
const decision: Pick<CleanupDecisionV1,'eligible'|'blockers'> = {eligible:false,blockers:['local_keep']};
void [policy,unsupported,destructive,decision];
