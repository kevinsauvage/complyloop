import type { CheckId } from "./types.js";
import type { CheckAuthority } from "./contract/requirement-status.js";

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
  "text-spacing",
] as const satisfies readonly CheckId[];

/**
 * RGAA 8.2 markup validity and 10.1 presentation — only html-validate emits
 * these at runtime. Status requires html-validate to have run, not just axe.
 */
const HTML_VALIDATE_OWNED_CHECK_IDS = [
  "markup-nesting",
  "css-for-presentation",
] as const satisfies readonly CheckId[];

const HTML_VALIDATE_OWNED = new Set<string>(HTML_VALIDATE_OWNED_CHECK_IDS);

export function isHtmlValidateOwnedCheck(checkId: string): boolean {
  return HTML_VALIDATE_OWNED.has(checkId);
}

/**
 * Runtime probes for patterns that may not exist on a page (CAPTCHA, hover
 * overlays, layout tables, media). An empty scan is not evidence of compliance.
 */
const APPLICABILITY_GATED_CHECK_IDS = [
  "captcha-alternative",
  "hover-content",
  "media-identification",
  "media-keyboard",
  "layout-table-linearization",
  "live-region-updates",
] as const satisfies readonly CheckId[];

const APPLICABILITY_GATED = new Set<string>(APPLICABILITY_GATED_CHECK_IDS);

export function isApplicabilityGatedCheck(checkId: string): boolean {
  return APPLICABILITY_GATED.has(checkId);
}

/**
 * Checks the AST engine cannot pass. Without a successful runtime audit they
 * stay `unable_to_verify` — never `passed` from an empty source scan.
 * Includes axe-mapped rules with no AST implementation.
 *
 * Note: `error-prevention` and `accessible-auth-enhanced` are heuristic-only
 * for status derivation — runtime probes may still emit violations.
 */
const RUNTIME_ONLY_CHECK_IDS = [
  "color-contrast",
  "document-title",
  "bypass",
  "landmark-one-main",
  "nested-interactive",
  "target-size",
  "target-size-enhanced",
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
  "forced-colors",
  "reflow",
  "text-spacing-runtime",
  "label-adjacent",
  "html-lang-valid",
  "css-disabled-content",
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
  "focus-order-logical",
  "focus-not-obscured-enhanced",
  "focus-appearance",
  "identical-links-purpose",
  "hidden-content",
  "css-for-presentation",
  "css-off-understandable",
  "supplementary-content-keyboard",
  "dialog-keyboard",
  "tabs-keyboard",
  "disclosure-keyboard",
  "menu-keyboard",
  "color-contrast-enhanced",
  "markup-nesting",
  "broken-link",
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
  "consistent-lang",
  "consistent-page-heading",
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
  "hover-content",
  "label-adjacent",
  "captcha-alternative",
  "media-identification",
  "media-keyboard",
  "layout-table-linearization",
  "live-region-updates",
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

/**
 * Source findings for these ids duplicate axe / html-validate / jsx-a11y on
 * the rendered page. CI still emits them; when a runtime audit ran they drop.
 */
const PACKAGE_TWIN_SOURCE_CHECK_IDS = [
  "img-alt",
  "list-structure",
  "audio-caption",
  "video-caption",
  "no-blink-marquee",
  "meta-viewport",
  "aria-props",
  "aria-role",
  "aria-required-attr",
  "aria-activedescendant",
  "keyboard-interaction",
  "html-lang",
  "iframe-title",
  "autocomplete-valid",
  "no-accesskey",
  "no-autofocus",
  "noninteractive-tabindex",
  "redundant-role",
  "th-scope",
  "positive-tabindex",
] as const satisfies readonly CheckId[];

const PACKAGE_TWIN_SOURCE = new Set<string>(PACKAGE_TWIN_SOURCE_CHECK_IDS);

export function isPackageTwinSourceCheck(checkId: string): boolean {
  return PACKAGE_TWIN_SOURCE.has(checkId);
}

export function isSiteLevelCheck(checkId: string): boolean {
  return SITE_LEVEL.has(checkId);
}

export function isHeuristicCheck(checkId: string): boolean {
  return HEURISTIC.has(checkId);
}

/**
 * The single authority classifier. Precedence matters — a check id may appear
 * in more than one list (e.g. `error-prevention` is heuristic in the AST
 * engine but runtime-owned), and this order is the contract:
 *
 * 1. `site_level` (subset of runtime-only, needs ≥2 routes)
 * 2. `runtime_only` (runtime audit owns the verdict)
 * 3. `heuristic` (empty AST scan must not pass)
 * 4. `composition_sensitive` (AST owns status; runtime wins when it ran)
 * 5. `standard` (plain AST check)
 *
 * Consumers: `deriveRequirementStatus` (`src/core/requirement-status.ts`) via
 * the adapter in `src/server/assessment-status.ts`.
 */
export function authorityForCheck(checkId: string): CheckAuthority {
  if (isSiteLevelCheck(checkId)) return "site_level";
  if (isRuntimeOnlyCheck(checkId)) return "runtime_only";
  if (isHeuristicCheck(checkId)) return "heuristic";
  if (isCompositionSensitiveCheck(checkId)) return "composition_sensitive";
  return "standard";
}

/** Runtime findings for these ids must not be resolved when axe did not run. */
export function keepOpenWhenRuntimeScanSkipped(checkId: string): boolean {
  return (
    isCompositionSensitiveCheck(checkId) || isRuntimeOnlyCheck(checkId)
  );
}
