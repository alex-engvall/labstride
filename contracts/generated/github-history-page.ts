/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface GitHubHistoryPage {
  schemaVersion: "1.0";
  /**
   * @maxItems 100
   */
  events: GitHubHistoryEvent[];
  endCursor: string | null;
  hasNextPage: boolean;
}
export interface GitHubHistoryEvent {
  id: string;
  kind: "added" | "removed" | "status";
  scopeId: string;
  actorId: string | null;
  occurredAt: string;
  previousStatus: string | null;
  status: string | null;
}
