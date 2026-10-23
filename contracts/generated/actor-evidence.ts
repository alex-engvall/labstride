/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface VerifiedRequestActorEvidence {
  schemaVersion: "1.0";
  installationId: string;
  providerId: string;
  externalId: string;
  subjectId: string;
  actorId: string;
  repositoryId: string;
  repository: string;
  configDigest: string;
  generation: number;
  observationDigest: string;
  /**
   * @minItems 1
   * @maxItems 256
   */
  evidenceRefs: [string, ...string[]];
}
