/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface TrustedWorkspaceHelperPolicyV2 {
  schemaVersion: "2.0";
  installationId: string;
  targetId: string;
  targetRevision: number;
  helperUid: number;
  codingUid: number;
  stateDir: string;
  /**
   * @minItems 1
   * @maxItems 16
   */
  roots:
    | [
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        }
      ]
    | [
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        }
      ]
    | [
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        }
      ]
    | [
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        }
      ]
    | [
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        }
      ]
    | [
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        }
      ]
    | [
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        }
      ]
    | [
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        }
      ]
    | [
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        }
      ]
    | [
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        }
      ]
    | [
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        }
      ]
    | [
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        }
      ]
    | [
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        }
      ]
    | [
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        }
      ]
    | [
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        }
      ]
    | [
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        },
        {
          id: string;
          path: string;
          identity: {
            device: number;
            inode: number;
            mountId: number;
            uid: number;
          };
        }
      ];
  codingGid: number;
  /**
   * @minItems 1
   * @maxItems 128
   */
  sources: [
    {
      repositoryId: string;
      repository: string;
      gitUrl: string;
      apiUrl: string;
      credentialFile: string | null;
    },
    ...{
      repositoryId: string;
      repository: string;
      gitUrl: string;
      apiUrl: string;
      credentialFile: string | null;
    }[]
  ];
}
