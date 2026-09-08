import type { CheckId } from "../check-registry.ts";

/**
 * Maps html-validate rule ids to ComplyLoop check ids.
 *
 * html-validate is **narrow by design**: structural evidence for RGAA 8.2 markup
 * validity and RGAA 10.1 presentational markup — not a second accessibility
 * scanner. Duplicate ids, landmarks, labels, ARIA, and broken idrefs stay on
 * axe / AST / custom Playwright checks.
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
  "no-deprecated-attr": "css-for-presentation",
  deprecated: "css-for-presentation",
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

/** Rule ids the map knows — kept in sync with the rendered pass by test. */
export const HTML_VALIDATE_TO_CHECK_RULE_IDS = Object.keys(
  HTML_VALIDATE_TO_CHECK,
);
