/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface RunnerDiagnosticRequestV1 {
  schemaVersion: "1.0";
  probeId: string;
  case?: "positive" | "wrong-repository" | "wrong-workflow" | "wrong-run" | "wrong-attempt";
}
