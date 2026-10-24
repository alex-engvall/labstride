/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface TrustedRuntimeInstallationV3 {
  schemaVersion: "3.0";
  workspacePolicy: TrustedWorkspaceHelperPolicyV2;
  runtimePolicy: TrustedRuntimeHelperPolicyV1;
}
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
  cleanup?: QualifiedCleanupProfile;
}
export interface QualifiedCleanupProfile {
  profile: "linux-exclusive-writers.v1";
}
export interface TrustedRuntimeHelperPolicyV1 {
  schemaVersion: "1.0";
  installationId: string;
  targetId: string;
  targetRevision: number;
  helperUid: number;
  stateDir: string;
  /**
   * @minItems 1
   * @maxItems 64
   */
  recipes: [InstalledRuntimeRecipeV1, ...InstalledRuntimeRecipeV1[]];
}
export interface InstalledRuntimeRecipeV1 {
  id: string;
  version: string;
  driver: ProtectedRecipeDriver;
  configuration: {
    [k: string]: unknown;
  };
  /**
   * @minItems 1
   * @maxItems 16
   */
  resources:
    | [ResourceSlot]
    | [ResourceSlot, ResourceSlot]
    | [ResourceSlot, ResourceSlot, ResourceSlot]
    | [ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot]
    | [ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot]
    | [ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot]
    | [ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot]
    | [ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot, ResourceSlot]
    | [
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot
      ]
    | [
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot
      ]
    | [
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot
      ]
    | [
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot
      ]
    | [
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot
      ]
    | [
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot
      ]
    | [
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot
      ]
    | [
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot,
        ResourceSlot
      ];
  cleanup: RecipeDisposalDeclaration;
  timeoutMs: number;
}
export interface ProtectedRecipeDriver {
  path: string;
  integrity: string;
}
export interface ResourceSlot {
  key: string;
  type: string;
}
export interface RecipeDisposalDeclaration {
  actionId: string;
  actionVersion: string;
  trigger: string;
}
