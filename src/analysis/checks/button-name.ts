import ts from "typescript";
import { hasAriaName, isPropSpreadingHost } from "../jsx-primitives";
import {
  hasTextContent,
  locationOf,
  spanOf,
  tagNameOf,
  visitJsxTags,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

export const buttonNameCheck: AccessibilityCheck = {
  id: "button-name",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "button") return;
      if (isPropSpreadingHost(node)) return;
      if (hasAriaName(node)) return;

      const named =
        ts.isJsxOpeningElement(node) &&
        ts.isJsxElement(node.parent) &&
        hasTextContent(node.parent);
      if (named) return;

      findings.push({
        checkId: "button-name",
        kind: "violation",
        severity: "critical",
        confidence: "high",
        reason:
          "<button> has no text content and no aria-label, so screen reader users hear only \u201cbutton\u201d with no clue what it does.",
        location: locationOf(source, node),
        fix: {
          kind: "insert_attribute",
          attribute: "aria-label",
          value: "Describe this action",
          editable: true,
          span: spanOf(node, source.sourceFile),
        },
      });
    });
    return findings;
  },
};
