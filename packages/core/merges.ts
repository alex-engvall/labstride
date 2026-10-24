import type { GitHubMergeEnrollmentV1 } from '../../contracts/generated/merge-enrollment.ts';
import type { GitHubMergeActionInputV1 } from '../../contracts/generated/merge-input.ts';
import type { GitHubMergeGateEvidenceV1 } from '../../contracts/generated/merge-evidence.ts';
import type { GitHubMergeIntentAndObservationV1 } from '../../contracts/generated/merge-record.ts';
import type { GitHubMergeDownstreamQualificationV1 } from '../../contracts/generated/merge-qualification.ts';
import type { RecordOf } from './lifecycle.ts';

export type MergeEnrollment = GitHubMergeEnrollmentV1;
export type MergeInput = GitHubMergeActionInputV1;
export type MergeEvidence = GitHubMergeGateEvidenceV1;
export type MergeRecord = GitHubMergeIntentAndObservationV1;
export type MergeQualification = GitHubMergeDownstreamQualificationV1;
export type MergeOperation = RecordOf<'operation'>['request'];
export const mergeAction = 'labstride.github-merge';
export const mergeVersion = '1.0.0';
export const mergeResource = (e: MergeEnrollment) => `github-merge:${e.repository.nodeId}:${e.baseBranch}`;
export class MergeBlocked extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}
export interface MergeObservation {
  repositoryId: string; pullRequest: number; head: string; baseBranch: string;
  merged: boolean; mergeSha: string | null; mergedBy: number | null;
}
export interface MergeProvider {
  gate(enrollment: MergeEnrollment, input: MergeInput): Promise<MergeEvidence>;
  merge(enrollment: MergeEnrollment, input: MergeInput): Promise<{ merged: boolean; sha: string | null }>;
  observe(enrollment: MergeEnrollment, input: MergeInput): Promise<MergeObservation>;
  qualify(enrollment: MergeEnrollment, mergeSha: string, runId: number): Promise<MergeQualification>;
}
