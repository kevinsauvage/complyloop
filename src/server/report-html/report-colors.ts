import type {
  RequirementStatus,
  Severity,
} from "@complyloop/analysis-core/contract/statuses";
import {
  requirementStatusDisplay,
  type StatusTone,
} from "@/core/status-display";

/** Hex palette for standalone HTML reports (no Tailwind / app CSS). */
export interface ReportColorPair {
  fg: string;
  bg: string;
}

export const REPORT_TONE_COLORS: Record<
  Exclude<StatusTone, "signal">,
  ReportColorPair
> = {
  passed: { fg: "#15803d", bg: "#dcfce7" },
  failed: { fg: "#b91c1c", bg: "#fee2e2" },
  review: { fg: "#b45309", bg: "#fef3c7" },
  na: { fg: "#475569", bg: "#f1f5f9" },
  unverifiable: { fg: "#6d28d9", bg: "#ede9fe" },
};

export const REPORT_SEVERITY_COLORS: Record<Severity, ReportColorPair> = {
  critical: { fg: "#991b1b", bg: "#fecaca" },
  serious: { fg: "#c2410c", bg: "#ffedd5" },
  moderate: { fg: "#a16207", bg: "#fef9c3" },
  minor: { fg: "#0369a1", bg: "#e0f2fe" },
};

/** CSS class suffix for requirement status badges in the HTML report. */
export function reportStatusClass(status: RequirementStatus): string {
  const tone = requirementStatusDisplay(status).tone;
  switch (tone) {
    case "passed":
      return "status-passed";
    case "failed":
      return "status-failed";
    case "review":
      return "status-needs-review";
    case "na":
      return "status-not-applicable";
    case "unverifiable":
      return "status-unable";
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}
