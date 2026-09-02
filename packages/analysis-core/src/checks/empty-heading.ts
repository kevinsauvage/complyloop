import ts from "typescript";
import { hasAriaName } from "../jsx-primitives";
import {
  hasTextContent,
  locationOf,
  tagNameOf,
  visitJsxTags,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

const HEADING = /^h[1-6]$/i;

export const emptyHeadingCheck: AccessibilityCheck = {
  id: "empty-heading",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!HEADING.test(tagNameOf(node))) return;
      if (hasAriaName(node, { includeTitle: false })) return;

      if (ts.isJsxSelfClosingElement(node)) {
        findings.push({
          checkId: "empty-heading",
          kind: "violation",
          severity: "serious",
          confidence: "high",
          reason: `<${tagNameOf(node)} /> has no accessible name.`,
          location: locationOf(source, node),
          fix: null,
        });
        return;
      }

      if (
        ts.isJsxOpeningElement(node) &&
        ts.isJsxElement(node.parent) &&
        !hasTextContent(node.parent)
      ) {
        findings.push({
          checkId: "empty-heading",
          kind: "violation",
          severity: "serious",
          confidence: "high",
          reason: `<${tagNameOf(node)}> has no text content or aria-label.`,
          location: locationOf(source, node),
          fix: null,
        });
      }
    });
    return findings;
  },
};
