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
