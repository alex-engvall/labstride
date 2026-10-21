/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

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
