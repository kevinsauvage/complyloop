import type { CheckId } from "./types.ts";

/**
 * Maps eslint-plugin-jsx-a11y rule ids (with or without the plugin prefix)
 * to catalog check ids. Unmapped rules are never enabled.
 */
const JSX_A11Y_TO_CHECK: Record<string, CheckId> = {
  "alt-text": "img-alt",
  "img-redundant-alt": "img-alt",
  "anchor-has-content": "anchor-name",
  "aria-activedescendant-has-tabindex": "aria-activedescendant",
  "aria-props": "aria-props",
  "aria-proptypes": "aria-props",
  "aria-role": "aria-role",
  "aria-unsupported-elements": "aria-props",
  "autocomplete-valid": "autocomplete-valid",
  "click-events-have-key-events": "keyboard-interaction",
  "heading-has-content": "empty-heading",
  "html-has-lang": "html-lang",
  "iframe-has-title": "iframe-title",
  "interactive-supports-focus": "keyboard-interaction",
  "label-has-associated-control": "input-label",
  lang: "html-lang-valid",
  "mouse-events-have-key-events": "keyboard-interaction",
  "no-access-key": "no-accesskey",
  "no-aria-hidden-on-focusable": "aria-hidden-focusable",
  "no-autofocus": "no-autofocus",
  "no-interactive-element-to-noninteractive-role": "aria-role",
  "no-noninteractive-element-interactions": "keyboard-interaction",
  "no-noninteractive-element-to-interactive-role": "aria-role",
  "no-noninteractive-tabindex": "noninteractive-tabindex",
  "no-redundant-roles": "redundant-role",
  "no-static-element-interactions": "keyboard-interaction",
  "role-has-required-aria-props": "aria-required-attr",
  "role-supports-aria-props": "aria-props",
  scope: "th-scope",
  "tabindex-no-positive": "positive-tabindex",
};

function bareRuleId(ruleId: string): string {
  return ruleId.startsWith("jsx-a11y/")
    ? ruleId.slice("jsx-a11y/".length)
    : ruleId;
}

export function checkIdForJsxA11yRule(ruleId: string): CheckId | undefined {
  return JSX_A11Y_TO_CHECK[bareRuleId(ruleId)];
}

/** Distinct catalog ids that jsx-a11y can emit. Used to keep guidance in sync. */
export function jsxA11yMappedCheckIds(): CheckId[] {
  return [...new Set(Object.values(JSX_A11Y_TO_CHECK))];
}

/** Flat-config rule map: only catalog-backed jsx-a11y rules, all errors. */
export function jsxA11yEslintRules(): Record<string, "error"> {
  const rules: Record<string, "error"> = {};
  for (const id of Object.keys(JSX_A11Y_TO_CHECK)) {
    rules[`jsx-a11y/${id}`] = "error";
  }
  return rules;
}
