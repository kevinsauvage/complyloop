import ts from "typescript";
import { hasAriaName, isPropSpreadingHost } from "../jsx-primitives.ts";
import {
  hasTextContent,
  jsxElementOf,
  locationOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

export const emptyThCheck: AccessibilityCheck = {
  id: "empty-th",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "th") return;
      if (isPropSpreadingHost(node)) return;
      if (hasAriaName(node, { includeTitle: false })) return;

      const element = jsxElementOf(node);
      if (element && hasTextContent(element)) return;
      if (!element && ts.isJsxOpeningElement(node)) return;

      findings.push({
        checkId: "empty-th",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          "<th> has no accessible name, so assistive technologies cannot announce the column or row header.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
