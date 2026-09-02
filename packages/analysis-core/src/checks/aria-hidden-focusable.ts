import { isFocusable } from "../a11y-model.js";
import {
  booleanAttributeValue,
  getAttribute,
  locationOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

function isAriaHiddenTrue(
  node: Parameters<typeof getAttribute>[0],
): boolean {
  const attr = getAttribute(node, "aria-hidden");
  const value = booleanAttributeValue(attr);
  // Unknown/dynamic expressions are treated as potentially hidden.
  return value === true || value === null;
}

export const ariaHiddenFocusableCheck: AccessibilityCheck = {
  id: "aria-hidden-focusable",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!isAriaHiddenTrue(node)) return;
      if (!isFocusable(node)) return;
      findings.push({
        checkId: "aria-hidden-focusable",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason: `Focusable <${tagNameOf(node)}> has aria-hidden="true", so keyboard users can focus an element assistive technologies ignore.`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
