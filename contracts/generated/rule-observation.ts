/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface TrustedNormalizedFieldObservation {
  schemaVersion: "1.0";
  event: LabstrideNormalizedEventV1;
  initialSync: boolean;
  generation: number;
  current: {
    [k: string]:
      | {
          present: false;
        }
      | {
          present: true;
          value: string | number | boolean | null | string[];
        };
  };
  previous: {
    [k: string]:
      | {
          present: false;
        }
      | {
          present: true;
          value: string | number | boolean | null | string[];
        };
  };
  configDigest: string;
}
export interface LabstrideNormalizedEventV1 {
  schemaVersion: "1.0";
  eventId: string;
  installationId: string;
  provider: string;
  kind: string;
  origin: "human" | "provider" | "coordinator" | "extension";
  externalId: string;
  subjectId: string;
  actorId: string;
  occurredAt: string;
  observedAt: string;
  sourceVersion: string;
  facts: {
    [k: string]: unknown;
  };
}
