export interface CustomViolationNode {
  html: string;
  target: string[];
}

export interface CustomViolation {
  id: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  description: string;
  help: string;
  nodes: CustomViolationNode[];
}
