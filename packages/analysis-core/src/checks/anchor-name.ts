import ts from "typescript";
import { hasAriaName, isPropSpreadingHost } from "../jsx-primitives.js";
import {
  getAttribute,
  hasTextContent,
  locationOf,
  spanOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

export const anchorNameCheck: AccessibilityCheck = {
  id: "anchor-name",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (tag !== "a" && tag !== "Link") return;
      if (isPropSpreadingHost(node)) return;
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
