import type { Server } from 'node:http';
import type { JWTVerifyGetKey } from 'jose';
import type { OperatorEnrolledRunnerDiagnosticPolicyV1 } from '../../contracts/generated/runner-probe-policy.ts';
export function createVerifier(policy: OperatorEnrolledRunnerDiagnosticPolicyV1, dependencies: { getKey?: JWTVerifyGetKey; readRun: (policy: OperatorEnrolledRunnerDiagnosticPolicyV1) => Promise<unknown>; currentDate?: Date }): (token: string, probeCase?: string) => Promise<unknown>;
export function createProbeServer(verify: ReturnType<typeof createVerifier>): Server;
