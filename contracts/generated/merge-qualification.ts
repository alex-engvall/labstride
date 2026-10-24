/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export type GitHubMergeDownstreamQualificationV1 = {
  schemaVersion: "1.0";
  repositoryId: number;
  appId: number;
  installationId: number;
  actorId: number;
  credentialRef: string;
  mergeSha: string;
  workflowId: number;
  workflowBlobSha: string;
  runId: number;
  runAttempt: number;
  event: "push";
  qualified: boolean;
  blocker: string | null;
};
