import type { Confidence, FindingKind, Severity } from "@/core/statuses";
import type { FindingLocation, ProposedFix } from "@/core/finding-types";
import type { ParsedSource } from "./parse";

export type CheckId =
  | "img-alt"
  | "button-name"
  | "html-lang"
  | "positive-tabindex"
  | "input-label"
  | "anchor-name"
  | "heading-order"
  | "empty-heading"
  | "iframe-title"
  | "autoplay-media"
  | "duplicate-id"
  | "form-error-association"
  | "aria-hidden-focusable"
  | "aria-role"
  | "aria-props"
  | "aria-required-attr"
  | "no-autofocus"
  | "keyboard-interaction"
  | "meta-viewport"
  | "list-structure"
  | "color-contrast"
  | "document-title"
  | "bypass"
  | "landmark-one-main"
  | "nested-interactive"
  | "target-size"
  | "autocomplete-valid"
  | "table-headers"
  | "page-heading"
  | "content-region"
  | "label-in-name"
  | "lang-parts"
  | "aria-roledescription"
  | "presentation-role"
  | "no-auto-refresh"
  | "no-orientation-lock"
  | "landmark-unique"
  | "pointer-gesture"
  | "pointer-cancellation"
  | "motion-actuation"
  | "focus-context-change"
  | "input-context-change"
  | "sensory-characteristics"
  | "image-of-text"
  | "error-suggestion"
  | "video-caption"
  | "audio-caption"
  | "no-blink-marquee"
  | "text-spacing"
  | "use-of-color"
  | "empty-th"
  | "dialog-name"
  | "tab-name"
  | "summary-name"
  | "frame-keyboard"
  | "p-as-heading"
  | "doctype"
  | "fieldset-legend"
  | "autocomplete-purpose"
  | "no-accesskey"
  | "optgroup"
  | "table-caption"
  | "th-scope"
  | "layout-table-markup"
  | "svg-name"
  | "figure-caption"
  | "redundant-role"
  | "noninteractive-tabindex"
  | "aria-activedescendant";

export interface RawFinding {
  checkId: CheckId;
  kind: FindingKind;
  severity: Severity;
  confidence: Confidence;
  reason: string;
  location: FindingLocation;
  fix: ProposedFix | null;
  /** Defaults to `ast` when omitted. */
  engine?: "ast" | "runtime";
}

export interface AccessibilityCheck {
  id: CheckId;
  run(source: ParsedSource): RawFinding[];
}
