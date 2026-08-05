import {
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

const FOCUSABLE_TAGS = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
]);

function isAriaHiddenTrue(
  node: Parameters<typeof getAttribute>[0],
): boolean {
  const attr = getAttribute(node, "aria-hidden");
  if (!attr) return false;
  const value = stringValueOf(attr);
  // aria-hidden or aria-hidden="true" (boolean attribute in JSX is rare)
  return value === undefined || value === "true";
}

function isFocusable(node: Parameters<typeof getAttribute>[0]): boolean {
  const tag = tagNameOf(node).toLowerCase();
  if (FOCUSABLE_TAGS.has(tag)) {
    if (tag === "a") {
      return getAttribute(node, "href") !== undefined;
    }
    const disabled =
      getAttribute(node, "disabled") ?? getAttribute(node, "aria-disabled");
    if (disabled) {
      const value = stringValueOf(disabled);
      if (value === undefined || value === "true") return false;
    }
    return true;
  }
  const tabIndex = getAttribute(node, "tabIndex") ?? getAttribute(node, "tabindex");
  if (!tabIndex) return false;
  const value = stringValueOf(tabIndex);
  if (value === undefined) return false;
  const n = Number(value);
  return !Number.isNaN(n) && n >= 0;
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
