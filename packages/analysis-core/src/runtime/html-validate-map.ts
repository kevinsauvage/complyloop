import type { CheckId } from "../types.js";

/**
 * Maps html-validate rule ids to ComplyLoop check ids (13.3).
 *
 * Every rule must map to a check id a catalog control owns; an unmapped rule is
 * never emitted (there is no "advisory" tier — a finding with no control is
 * invisible in the product).
 *
 * `element-permitted-content` always maps to `markup-nesting`. On the rendered
 * DOM the browser auto-repairs interactive-in-interactive nesting, so that
 * case never reaches html-validate here — axe owns `nested-interactive` on the
 * generated DOM.
 */
const HTML_VALIDATE_TO_CHECK: Record<string, CheckId> = {
  "element-permitted-content": "markup-nesting",
  "element-permitted-order": "markup-nesting",
  "close-order": "markup-nesting",
  "no-implicit-close": "markup-nesting",
  "no-dup-attr": "markup-nesting",
  "no-multiple-main": "landmark-one-main",
  "unique-landmark": "landmark-unique",
  "no-deprecated-attr": "css-for-presentation",
  deprecated: "css-for-presentation",
  "no-dup-id": "duplicate-id",
  "no-missing-references": "form-error-association",
};

/** Maps an html-validate rule id to its check id, or undefined if unmapped. */
export function checkIdForHtmlValidateRule(
  ruleId: string,
): CheckId | undefined {
  return HTML_VALIDATE_TO_CHECK[ruleId];
}

/** Distinct catalog ids html-validate can emit. */
export function htmlValidateMappedCheckIds(): CheckId[] {
  return [...new Set(Object.values(HTML_VALIDATE_TO_CHECK))];
}