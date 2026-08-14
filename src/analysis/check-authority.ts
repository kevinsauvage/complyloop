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
 */
const RUNTIME_ONLY_CHECK_IDS = [
  "color-contrast",
  "document-title",
  "bypass",
  "landmark-one-main",
  "nested-interactive",
  "target-size",
] as const satisfies readonly CheckId[];

const COMPOSITION_SENSITIVE = new Set<string>(COMPOSITION_SENSITIVE_CHECK_IDS);
const RUNTIME_ONLY = new Set<string>(RUNTIME_ONLY_CHECK_IDS);

export function isCompositionSensitiveCheck(checkId: string): boolean {
  return COMPOSITION_SENSITIVE.has(checkId);
}

export function isRuntimeOnlyCheck(checkId: string): boolean {
  return RUNTIME_ONLY.has(checkId);
}

/** Runtime findings for these ids must not be resolved when axe did not run. */
export function keepOpenWhenRuntimeScanSkipped(checkId: string): boolean {
  return (
    isCompositionSensitiveCheck(checkId) || isRuntimeOnlyCheck(checkId)
  );
}
