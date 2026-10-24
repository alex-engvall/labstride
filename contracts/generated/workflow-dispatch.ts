/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface WorkflowDispatchRecordV1 {
  schemaVersion: "1.0";
  operationId: string;
  requestDigest: string;
  enrollment: WorkflowEnrollmentV1;
  submittedAt: string;
  runId: string | null;
}
export interface WorkflowEnrollmentV1 {
  schemaVersion: "1.0";
  repository: {
    name: string;
    nodeId: string;
    id: string;
    ownerId: string;
  };
  workflowId: string;
  workflowPath: string;
  ref: string;
  workflowSha: string;
  targetId: string;
  environment: string;
  credentialRef: string;
  inputs: {
    [k: string]: string;
  };
}
