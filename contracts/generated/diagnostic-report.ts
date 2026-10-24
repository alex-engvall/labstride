/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */

export interface OperatorDiagnosticReportV1 {
  schemaVersion: "1.0";
  ok: boolean;
  enabled: boolean;
  diagnostics: {
    code: string;
    path: string;
    severity: "error" | "warning" | "info";
    status: "observed" | "unavailable" | "unsupported" | "disabled" | "declared";
    message: string;
  }[];
}
