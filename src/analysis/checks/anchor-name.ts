import ts from "typescript";
import {
  getAttribute,
  hasTextContent,
  locationOf,
  spanOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

function hasAriaName(node: JsxTagNode): boolean {
  return (
    getAttribute(node, "aria-label") !== undefined ||
    getAttribute(node, "aria-labelledby") !== undefined ||
    getAttribute(node, "title") !== undefined
  );
}

export const anchorNameCheck: AccessibilityCheck = {
  id: "anchor-name",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (tag !== "a" && tag !== "Link") return;
      if (tag === "a" && getAttribute(node, "href") === undefined) return;
      if (hasAriaName(node)) return;

      const named =
        ts.isJsxOpeningElement(node) &&
        ts.isJsxElement(node.parent) &&
        hasTextContent(node.parent);
      if (named) return;

      findings.push({
        checkId: "anchor-name",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason: `<${tag}> has no text content and no aria-label, so its destination is unclear to assistive technologies.`,
        location: locationOf(source, node),
        fix: {
          kind: "insert_attribute",
          attribute: "aria-label",
          value: "Describe this destination",
          editable: true,
          span: spanOf(node, source.sourceFile),
        },
      });
    });
    return findings;
  },
};
