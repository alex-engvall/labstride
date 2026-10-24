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

export interface GitHubMergeIntentAndObservationV1 {
  schemaVersion: "1.0";
  operationId: string;
  requestDigest: string;
  enrollment: GitHubMergeEnrollmentV1;
  pullRequest: number;
  evidence: GitHubMergeGateEvidenceV1;
  submittedAt: string;
  responseSha: string | null;
  mergeSha: string | null;
  outcome: "pending" | "confirmed" | "observed_external" | "rejected" | "conflict";
}
export interface GitHubMergeEnrollmentV1 {
  schemaVersion: "1.0";
  repository: {
    name: string;
    nodeId: string;
    id: number;
  };
  targetId: string;
  baseBranch: string;
  method: "merge" | "squash" | "rebase";
  credentialRef: string;
  protectionCredentialRef: string;
  appId: number;
  installationId: number;
  actorId: number;
  /**
   * @minItems 1
   * @maxItems 100
   */
  checks: [
    {
      context: string;
      appId: number;
    },
    ...{
      context: string;
      appId: number;
    }[]
  ];
  /**
   * @minItems 1
   * @maxItems 20
   */
  workflows:
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ]
    | [
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        },
        {
          id: number;
          path: string;
          blobSha: string;
          appId: number;
        }
      ];
  downstream: {
    id: number;
    path: string;
    blobSha: string;
    appId: number;
  };
  qualification: {
    mergeSha: string;
    pullRequest: number;
    runId: number;
  };
}
export interface GitHubMergeGateEvidenceV1 {
  schemaVersion: "1.0";
  head: string;
  base: string;
  testMerge: string | null;
  protectionDigest: string;
  /**
   * @minItems 1
   * @maxItems 200
   */
  checks: [
    {
      context: string;
      appId: number;
      id: number;
      sha: string;
    },
    ...{
      context: string;
      appId: number;
      id: number;
      sha: string;
    }[]
  ];
  /**
   * @minItems 1
   * @maxItems 20
   */
  runs:
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ]
    | [
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        },
        {
          id: number;
          attempt: number;
          workflowId: number;
          blobSha: string;
        }
      ];
  qualification: GitHubMergeDownstreamQualificationV1;
}
