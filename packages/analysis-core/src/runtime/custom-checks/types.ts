import type { CheckId } from "../../check-registry.ts";

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

export const CUSTOM_PROBE_CHECK_IDS = [
  "accessible-auth-enhanced",
  "captcha-alternative",
  "css-off-understandable",
  "dialog-keyboard",
  "disclosure-keyboard",
  "error-prevention",
  "focus-not-obscured",
  "focus-visible",
  "form-error-association",
  "hover-content",
  "keyboard-trap",
  "layout-table-linearization",
  "live-region-updates",
  "media-identification",
  "media-keyboard",
  "menu-keyboard",
  "non-text-contrast",
  "reduced-motion",
  "reflow",
  "supplementary-content-keyboard",
  "tabs-keyboard",
  "target-size-enhanced",
  "text-spacing-runtime",
] as const satisfies readonly CheckId[];
