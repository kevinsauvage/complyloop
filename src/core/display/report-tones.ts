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

const SIGNALLESS_TONES: readonly SignallessTone[] = [
  "passed",
  "failed",
  "review",
  "na",
  "unverifiable",
];

/**
 * One `pick` per derived lookup: reads a single field off the tone table, so
 * adding a tone edits `STATUS_TONE_STYLE` only and every map below follows.
 */
function mapTone<T>(
  pick: (style: StatusToneStyle) => T,
): Record<StatusTone, T> {
  return Object.fromEntries(
    (Object.keys(STATUS_TONE_STYLE) as StatusTone[]).map((tone) => [
      tone,
      pick(STATUS_TONE_STYLE[tone]),
    ]),
  ) as Record<StatusTone, T>;
}

/** Like {@link mapTone}, minus `signal` (which never appears in a report). */
function mapSignallessTone<T>(
  pick: (style: StatusToneStyle) => T,
): Record<SignallessTone, T> {
  return Object.fromEntries(
    SIGNALLESS_TONES.map((tone) => [tone, pick(STATUS_TONE_STYLE[tone])]),
  ) as Record<SignallessTone, T>;
}

export const STATUS_TONE_BADGE = mapTone((style) => style.badge);
export const STATUS_TONE_ACCENT = mapSignallessTone((style) => style.accent);
export const STATUS_TONE_DOT = mapTone((style) => style.dot);
export const STATUS_TONE_REPORT = mapSignallessTone((style) => {
  if (!style.report) throw new Error("Missing report palette for status tone.");
  return style.report;
});
export const STATUS_TONE_REPORT_CLASS = mapSignallessTone((style) => {
  if (!style.reportClass)
    throw new Error("Missing report class for status tone.");
  return style.reportClass;
});
