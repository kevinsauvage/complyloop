import type { Confidence, FindingKind, Severity } from "./contract/statuses.js";
import type { FindingLocation, ProposedFix } from "./contract/finding-types.js";
import type { ParsedSource } from "./parse.js";

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
  | "dialog-keyboard"
  | "tabs-keyboard"
  | "disclosure-keyboard"
  | "menu-keyboard"
  | "meta-viewport"
  | "list-structure"
  | "color-contrast"
  | "document-title"
  | "bypass"
  | "landmark-one-main"
  | "nested-interactive"
  | "target-size"
  | "target-size-enhanced"
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
  | "aria-activedescendant"
  | "focus-visible"
  | "keyboard-trap"
  | "focus-not-obscured"
  | "accessible-auth"
  | "dragging"
  | "new-window-onload"
  | "dir-change"
  | "blockquote-cite"
  | "status-live"
  | "live-region-updates"
  | "hover-content"
  | "non-text-contrast"
  | "forced-colors"
  | "reflow"
  | "text-spacing-runtime"
  | "label-adjacent"
  | "both-colors"
  | "redundant-entry"
  | "html-lang-valid"
  | "table-summary"
  | "image-detailed-description"
  | "media-controls-present"
  | "css-disabled-content"
  | "media-keyboard"
  | "multiple-ways"
  | "consistent-nav"
  | "consistent-labels"
  | "consistent-help"
  | "nontemporal-media-alt"
  | "field-grouping"
  | "resize-text"
  | "audio-description-track"
  | "link-explicit-heuristic"
  | "office-docs-alt-present"
  | "media-keyboard-static"
  | "css-hover-keyboard"
  | "consistent-sitemap"
  | "consistent-search"
  | "consistent-landmarks"
  | "duplicate-page-title"
  | "consistent-lang"
  | "consistent-page-heading"
  | "decorative-ignored"
  | "lang-change"
  | "cryptic-content-alt"
  | "audio-description-or-alt"
  | "captions-live"
  | "focus-order-logical"
  | "focus-not-obscured-enhanced"
  | "focus-appearance"
  | "identical-links-purpose"
  | "hidden-content"
  | "css-for-presentation"
  | "css-off-understandable"
  | "layout-table-linearization"
  | "error-prevention"
  | "accessible-auth-enhanced"
  | "captcha-alternative"
  | "supplementary-content-keyboard"
  | "reduced-motion"
  | "media-identification"
  | "color-contrast-enhanced"
  | "markup-nesting"
  | "broken-link";

/** Which analyzer produced an observation (finer than `engine`). */
export type AnalyzerId =
  | "ast"
  | "jsx-a11y"
  | "axe"
  | "html-validate"
  | "ibm"
  | "playwright-custom"
  | "site-level"
  | "linkinator";

export interface AnalyzerContribution {
  analyzerId: AnalyzerId;
  analyzerRuleId?: string;
  analyzerVersion?: string;
}

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
  /** Specific analyzer within the coarse `engine` bucket. */
  analyzerId?: AnalyzerId;
  /** axe / html-validate / IBM / jsx-a11y rule id, or `complyloop-*` probe id. */
  analyzerRuleId?: string;
  /** Package version of the analyzer when cheap to resolve. */
  analyzerVersion?: string;
  /** Other analyzers merged into this finding during runtime dedupe. */
  contributingAnalyzers?: AnalyzerContribution[];
}

export interface AccessibilityCheck {
  id: CheckId;
  run(source: ParsedSource): RawFinding[];
}
