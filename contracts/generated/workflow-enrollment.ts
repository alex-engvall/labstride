/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

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
