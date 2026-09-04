import type { CheckId } from "../../types.ts";

export interface CustomViolationNode {
  html: string;
  target: string[];
  /** Human-readable element identity for the UI. */
  elementLabel?: string;
  /** Extra context (e.g. obscuring element). */
  failureSummary?: string;
}

export interface CustomViolation {
  id: CheckId;
  impact: "critical" | "serious" | "moderate" | "minor";
  description: string;
  help: string;
  nodes: CustomViolationNode[];
}

/** Catalog ids Playwright custom probes can emit. */
export const CUSTOM_PROBE_CHECK_IDS = [
  "accessible-auth-enhanced",
  "captcha-alternative",
  "css-disabled-content",
  "css-hover-keyboard",
  "css-off-understandable",
  "dialog-keyboard",
  "disclosure-keyboard",
  "error-prevention",
  "focus-appearance",
  "focus-not-obscured",
  "focus-not-obscured-enhanced",
  "focus-visible",
  "forced-colors",
  "form-error-association",
  "hover-content",
  "keyboard-trap",
  "label-adjacent",
  "layout-table-linearization",
  "live-region-updates",
  "media-identification",
  "media-keyboard",
  "menu-keyboard",
  "non-text-contrast",
  "reduced-motion",
  "reflow",
  "resize-text",
  "supplementary-content-keyboard",
  "tabs-keyboard",
  "target-size-enhanced",
  "text-spacing-runtime",
] as const satisfies readonly CheckId[];

export function customProbeCheckIds(): CheckId[] {
  return [...CUSTOM_PROBE_CHECK_IDS];
}
