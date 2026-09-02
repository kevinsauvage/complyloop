import { classNameTextOf } from "./heuristic-utils.js";
import { getAttribute, locationOf, visitJsxTags } from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

const OUTLINE_RESET = /\boutline-none\b|\boutline-hidden\b/;
const FOCUS_REPLACEMENT =
  /\bfocus-visible:|\bfocus:.*\bring\b|\bfocus:.*\bborder\b|\bfocus-visible:.*\bring\b/;

function styleRemovesOutline(node: Parameters<typeof getAttribute>[0]): boolean {
  const style = getAttribute(node, "style");
  if (!style?.initializer) return false;
  const text = style.initializer.getText();
  return /outline\s*:\s*["']?none/i.test(text);
}

export const outlineNoneCheck: AccessibilityCheck = {
  id: "outline-none",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const classText = classNameTextOf(node);
      const removesOutline =
        OUTLINE_RESET.test(classText) || styleRemovesOutline(node);
      if (!removesOutline) return;
      if (FOCUS_REPLACEMENT.test(classText)) return;

      findings.push({
        checkId: "outline-none",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "Focus outline is removed without a visible focus-visible replacement (ring, border, or box-shadow) in the same class or style (WCAG 2.4.7).",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
