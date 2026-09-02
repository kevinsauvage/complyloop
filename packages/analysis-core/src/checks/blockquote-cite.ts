import ts from "typescript";
import {
  getAttribute,
  jsxElementOf,
  locationOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.js";
import { descendantTags, textContentOf } from "./heuristic-utils.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

function hasCitationContent(element: ts.JsxElement): boolean {
  if (descendantTags(element).some((tag) => tagNameOf(tag) === "cite")) {
    return true;
  }
  const text = textContentOf(element).trim();
  return text.length > 0;
}

export const blockquoteCiteCheck: AccessibilityCheck = {
  id: "blockquote-cite",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node).toLowerCase() !== "blockquote") return;
      const cite = getAttribute(node, "cite");
      if (!cite) return;
      const element = jsxElementOf(node);
      if (element && hasCitationContent(element)) return;
      if (!element || !hasCitationContent(element)) {
        findings.push({
          checkId: "blockquote-cite",
          kind: "violation",
          severity: "moderate",
          confidence: "high",
          reason:
            "<blockquote cite> points at a source but exposes no citation text for assistive technologies (WCAG 1.3.1).",
          location: locationOf(source, node),
          fix: null,
        });
      }
    });
    return findings;
  },
};
