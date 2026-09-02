import type { CheckId } from "./types";

/**
 * Rules where composition across components makes source AST unreliable.
 * When a project has `runtimeBaseUrl`, runtime DOM results own status for these.
 * AST still runs in CI (`complyloop-check`) with primitive suppressions.
 */
const COMPOSITION_SENSITIVE_CHECK_IDS = [
  "input-label",
  "button-name",
  "anchor-name",
  "form-error-association",
  "heading-order",
  "empty-heading",
  "aria-hidden-focusable",
  "duplicate-id",
] as const satisfies readonly CheckId[];

/**
 * Checks the AST engine cannot pass. Without a successful runtime audit they
 * stay `unable_to_verify` — never `passed` from an empty source scan.
 * Includes axe-mapped rules with no AST implementation.
 */
const RUNTIME_ONLY_CHECK_IDS = [
  "color-contrast",
  "document-title",
  "bypass",
  "landmark-one-main",
  "nested-interactive",
  "target-size",
  "table-headers",
  "page-heading",
  "content-region",
  "label-in-name",
  "lang-parts",
  "aria-roledescription",
  "presentation-role",
  "no-auto-refresh",
  "no-orientation-lock",
  "landmark-unique",
  "use-of-color",
  "frame-keyboard",
  "doctype",
  "focus-visible",
  "keyboard-trap",
  "focus-not-obscured",
  "non-text-contrast",
  "reflow",
  "text-spacing-runtime",
  "hover-content",
  "label-adjacent",
  "html-lang-valid",
  "css-disabled-content",
  "media-keyboard",
  "resize-text",
  "css-hover-keyboard",
  "multiple-ways",
  "consistent-nav",
  "consistent-labels",
  "consistent-help",
  "consistent-sitemap",
  "consistent-search",
  "consistent-landmarks",
  "duplicate-page-title",
  "info-not-color-only",
  "focus-order-logical",
  "focus-not-obscured-enhanced",
  "focus-appearance",
  "identical-links-purpose",
  "hidden-content",
  "css-for-presentation",
  "css-off-understandable",
  "layout-table-linearization",
  "media-at-compatible",
  "flash-threshold",
  "error-prevention",
  "captcha-alternative",
  "accessible-auth-enhanced",
  "media-identification",
  "supplementary-content-keyboard",
  "color-contrast-enhanced",
] as const satisfies readonly CheckId[];

const SITE_LEVEL_CHECK_IDS = [
  "multiple-ways",
  "consistent-nav",
  "consistent-labels",
  "consistent-help",
  "consistent-sitemap",
  "consistent-search",
  "consistent-landmarks",
  "duplicate-page-title",
] as const satisfies readonly CheckId[];

/**
 * AST heuristics that only prove “no suspicious pattern”. An empty scan must
 * not pass the criterion — that still needs a human.
 */
const HEURISTIC_CHECK_IDS = [
  "image-detailed-description",
  "image-of-text",
  "table-summary",
  "sensory-characteristics",
  "error-suggestion",
  "pointer-gesture",
  "pointer-cancellation",
  "motion-actuation",
  "focus-context-change",
  "input-context-change",
  "audio-description-track",
  "audio-description-or-alt",
  "link-explicit-heuristic",
  "lang-change",
  "cryptic-content-alt",
  "captions-live",
  "error-prevention",
  "reduced-motion",
  "accessible-auth-enhanced",
] as const satisfies readonly CheckId[];

const COMPOSITION_SENSITIVE = new Set<string>(COMPOSITION_SENSITIVE_CHECK_IDS);
const RUNTIME_ONLY = new Set<string>(RUNTIME_ONLY_CHECK_IDS);
const SITE_LEVEL = new Set<string>(SITE_LEVEL_CHECK_IDS);
const HEURISTIC = new Set<string>(HEURISTIC_CHECK_IDS);

export function isCompositionSensitiveCheck(checkId: string): boolean {
  return COMPOSITION_SENSITIVE.has(checkId);
}

export function isRuntimeOnlyCheck(checkId: string): boolean {
  return RUNTIME_ONLY.has(checkId);
}

export function isSiteLevelCheck(checkId: string): boolean {
  return SITE_LEVEL.has(checkId);
}

export function isHeuristicCheck(checkId: string): boolean {
  return HEURISTIC.has(checkId);
}

/** Runtime findings for these ids must not be resolved when axe did not run. */
export function keepOpenWhenRuntimeScanSkipped(checkId: string): boolean {
  return (
    isCompositionSensitiveCheck(checkId) || isRuntimeOnlyCheck(checkId)
  );
}
