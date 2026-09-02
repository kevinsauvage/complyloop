import {
  locationOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

const HEADING = /^h([1-6])$/i;

export const headingOrderCheck: AccessibilityCheck = {
  id: "heading-order",
  run(source) {
    const findings: RawFinding[] = [];
    let previousLevel = 0;

    visitJsxTags(source.sourceFile, (node) => {
      const match = HEADING.exec(tagNameOf(node));
      if (!match) return;
      const level = Number(match[1]);
      if (previousLevel > 0 && level > previousLevel + 1) {
        findings.push({
          checkId: "heading-order",
          kind: "violation",
          severity: "moderate",
          confidence: "high",
          reason: `Heading level skipped from h${previousLevel} to h${level}; screen reader users lose the document outline.`,
          location: locationOf(source, node),
          fix: null,
        });
      }
      previousLevel = level;
    });

    return findings;
  },
};
