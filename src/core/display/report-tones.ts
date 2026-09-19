import { mustGet } from "./must-get";

/**
 * Display data lives as one record per enum value: `{ label, description,
 * tone? }`. Adding a status edits a single table; badges read tone via
 * `STATUS_TONE_BADGE` — no parallel color maps.
 */

export type StatusTone =
  "passed" | "failed" | "review" | "na" | "unverifiable" | "signal";

export type BadgeVariant = "secondary" | "outline" | undefined;

export interface ReportColorPair {
  fg: string;
  bg: string;
}

/**
 * The one tone table: every surface that renders a status tone — in-app badge
 * fill/text, accent bar, evidence dot, and the print/email report palette —
 * reads from here. Retune a tone once; the exported lookups below derive.
 */
interface StatusToneStyle {
  badge: string;
  accent: string;
  dot: string;
  report: ReportColorPair | null;
  reportClass: string | null;
}

const STATUS_TONE_STYLE = {
  passed: {
    badge:
      "border-transparent bg-status-passed/25 text-status-passed dark:bg-status-passed/25",
    accent: "bg-status-passed",
    dot: "bg-status-passed",
    report: { fg: "#15803d", bg: "#dcfce7" },
    reportClass: "status-passed",
  },
  failed: {
    badge:
      "border-transparent bg-status-failed/25 text-status-failed dark:bg-status-failed/25",
    accent: "bg-status-failed",
    dot: "bg-status-failed",
    report: { fg: "#b91c1c", bg: "#fee2e2" },
    reportClass: "status-failed",
  },
  review: {
    badge:
      "border-transparent bg-status-review/25 text-status-review dark:bg-status-review/25",
    accent: "bg-status-review",
    dot: "bg-status-review",
    report: { fg: "#b45309", bg: "#fef3c7" },
    reportClass: "status-needs-review",
  },
  na: {
    badge:
      "border-transparent bg-status-na/25 text-status-na dark:bg-status-na/25",
    accent: "bg-status-na",
    dot: "bg-status-na",
    report: { fg: "#475569", bg: "#f1f5f9" },
    reportClass: "status-not-applicable",
  },
  unverifiable: {
    badge:
      "border-transparent bg-status-unverifiable/25 text-status-unverifiable dark:bg-status-unverifiable/25",
    accent: "bg-status-unverifiable",
    dot: "bg-status-unverifiable",
    report: { fg: "#6d28d9", bg: "#ede9fe" },
    reportClass: "status-unable",
  },
  signal: {
    badge: "border-transparent bg-signal/25 text-signal dark:bg-signal/25",
    accent: "bg-signal",
    dot: "bg-signal",
    // `signal` is informational and never appears in a status report, so it
    // carries no report palette.
    report: null,
    reportClass: null,
  },
} satisfies Record<StatusTone, StatusToneStyle>;

type SignallessTone = Exclude<StatusTone, "signal">;

function toneStyle(tone: StatusTone): StatusToneStyle {
  return mustGet(STATUS_TONE_STYLE, tone, "status tone");
}

function requiredReport(tone: SignallessTone): ReportColorPair {
  const pair = toneStyle(tone).report;
  if (!pair) throw new Error(`Missing report palette: ${tone}`);
  return pair;
}

function requiredReportClass(tone: SignallessTone): string {
  const value = toneStyle(tone).reportClass;
  if (!value) throw new Error(`Missing report class: ${tone}`);
  return value;
}

export const STATUS_TONE_BADGE: Record<StatusTone, string> = {
  passed: toneStyle("passed").badge,
  failed: toneStyle("failed").badge,
  review: toneStyle("review").badge,
  na: toneStyle("na").badge,
  unverifiable: toneStyle("unverifiable").badge,
  signal: toneStyle("signal").badge,
};

export const STATUS_TONE_ACCENT: Record<SignallessTone, string> = {
  passed: toneStyle("passed").accent,
  failed: toneStyle("failed").accent,
  review: toneStyle("review").accent,
  na: toneStyle("na").accent,
  unverifiable: toneStyle("unverifiable").accent,
};

export const STATUS_TONE_DOT: Record<StatusTone, string> = {
  passed: toneStyle("passed").dot,
  failed: toneStyle("failed").dot,
  review: toneStyle("review").dot,
  na: toneStyle("na").dot,
  unverifiable: toneStyle("unverifiable").dot,
  signal: toneStyle("signal").dot,
};

export const STATUS_TONE_REPORT: Record<SignallessTone, ReportColorPair> = {
  passed: requiredReport("passed"),
  failed: requiredReport("failed"),
  review: requiredReport("review"),
  na: requiredReport("na"),
  unverifiable: requiredReport("unverifiable"),
};

export const STATUS_TONE_REPORT_CLASS: Record<SignallessTone, string> = {
  passed: requiredReportClass("passed"),
  failed: requiredReportClass("failed"),
  review: requiredReportClass("review"),
  na: requiredReportClass("na"),
  unverifiable: requiredReportClass("unverifiable"),
};
