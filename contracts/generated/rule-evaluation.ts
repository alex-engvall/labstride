/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export type ConfigurationRuleEvaluation = {
  schemaVersion: "1.0";
  outcome: "matched" | "no_match" | "blocked" | "rule_conflict";
  ruleIds: string[];
  workflow: string | null;
  code:
    | "matched"
    | "no_match"
    | "disabled"
    | "initial_sync"
    | "non_human_origin"
    | "unchanged"
    | "invalid_observation"
    | "invalid_value"
    | "rule_conflict";
};
