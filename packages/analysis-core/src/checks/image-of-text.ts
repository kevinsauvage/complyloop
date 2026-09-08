import {
  getAttribute,
  hasTextContent,
  locationOf,
  stringValueOf,
  visitJsxElements,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.ts";
import { styleHasBackgroundImage } from "./heuristic-utils.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

export const imageOfTextCheck: AccessibilityCheck = {
  id: "image-of-text",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node: JsxTagNode) => {
      if (!styleHasBackgroundImage(node)) return;
      findings.push({
        checkId: "image-of-text",
        kind: "warning",
        severity: "minor",
        confidence: "low",
        reason: `<${node.tagName.getText()}> uses a CSS background-image that may render text. Prefer real text so users can resize and recolor it (WCAG 1.4.5).`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    visitJsxElements(source.sourceFile, (element) => {
      const opening = element.openingElement;
      const role = getAttribute(opening, "role");
      if (role && stringValueOf(role) === "img" && hasTextContent(element)) {
        findings.push({
          checkId: "image-of-text",
          kind: "warning",
          severity: "minor",
          confidence: "low",
          reason: `<${opening.tagName.getText()} role="img"> contains text. Prefer real text over an image of text (WCAG 1.4.5).`,
          location: locationOf(source, opening),
          fix: null,
        });
      }
    });
    return findings;
  },
};
