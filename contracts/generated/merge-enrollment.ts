/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

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
