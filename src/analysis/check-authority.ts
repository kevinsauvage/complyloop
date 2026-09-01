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
  "multiple-ways",
  "consistent-nav",
  "consistent-labels",
] as const satisfies readonly CheckId[];

const SITE_LEVEL_CHECK_IDS = [
  "multiple-ways",
  "consistent-nav",
  "consistent-labels",
] as const satisfies readonly CheckId[];

const COMPOSITION_SENSITIVE = new Set<string>(COMPOSITION_SENSITIVE_CHECK_IDS);
const RUNTIME_ONLY = new Set<string>(RUNTIME_ONLY_CHECK_IDS);
const SITE_LEVEL = new Set<string>(SITE_LEVEL_CHECK_IDS);

export function isCompositionSensitiveCheck(checkId: string): boolean {
  return COMPOSITION_SENSITIVE.has(checkId);
}

export function isRuntimeOnlyCheck(checkId: string): boolean {
  return RUNTIME_ONLY.has(checkId);
}

export function isSiteLevelCheck(checkId: string): boolean {
  return SITE_LEVEL.has(checkId);
}

/** Runtime findings for these ids must not be resolved when axe did not run. */
export function keepOpenWhenRuntimeScanSkipped(checkId: string): boolean {
  return (
    isCompositionSensitiveCheck(checkId) || isRuntimeOnlyCheck(checkId)
  );
}
