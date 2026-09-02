export interface CustomViolationNode {
  html: string;
  target: string[];
  /** Human-readable element identity for the UI. */
  elementLabel?: string;
  /** Extra context (e.g. obscuring element). */
  failureSummary?: string;
}

export interface CustomViolation {
  id: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  description: string;
  help: string;
  nodes: CustomViolationNode[];
}
