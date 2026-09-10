import type {
  RequirementStatus,
  Severity,
} from "@complyloop/analysis-core/contract/statuses";
import {
  requirementStatusDisplay,
  type StatusTone,
} from "@/core/status-display";

/**
 * Hex palette for standalone HTML reports (no Tailwind / app CSS).
 *
 * Deliberate isolation for print/email — but a second source of truth next to
 * the app `STATUS_TONE_BADGE` tokens (`src/core/status-display.ts`, gated by
 * `src/core/status-contrast.test.ts`). If you retune either side, run
 * `report-colors.test.ts`: every pair must hold WCAG AA 4.5:1 so exports
 * never diverge from the app.
 */
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

/** CSS custom properties for the standalone report stylesheet. */
export function reportCssVariables(): string {
  const tone = REPORT_TONE_COLORS;
  const severity = REPORT_SEVERITY_COLORS;
  return `
  --passed: ${tone.passed.fg};
  --passed-bg: ${tone.passed.bg};
  --failed: ${tone.failed.fg};
  --failed-bg: ${tone.failed.bg};
  --review: ${tone.review.fg};
  --review-bg: ${tone.review.bg};
  --na: ${tone.na.fg};
  --na-bg: ${tone.na.bg};
  --unable: ${tone.unverifiable.fg};
  --unable-bg: ${tone.unverifiable.bg};
  --critical: ${severity.critical.fg};
  --critical-bg: ${severity.critical.bg};
  --serious: ${severity.serious.fg};
  --serious-bg: ${severity.serious.bg};
  --moderate: ${severity.moderate.fg};
  --moderate-bg: ${severity.moderate.bg};
  --minor: ${severity.minor.fg};
  --minor-bg: ${severity.minor.bg};`;
}
