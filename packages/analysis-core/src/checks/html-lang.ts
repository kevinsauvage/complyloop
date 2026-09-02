import {
  getAttribute,
  locationOf,
  spanOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

export const htmlLangCheck: AccessibilityCheck = {
  id: "html-lang",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "html") return;
      if (getAttribute(node, "lang") !== undefined) return;

      findings.push({
        checkId: "html-lang",
        kind: "violation",
        severity: "moderate",
        confidence: "high",
        reason:
          "<html> has no lang attribute, so screen readers cannot pick the right pronunciation rules for the page.",
        location: locationOf(source, node),
        fix: {
          kind: "insert_attribute",
          attribute: "lang",
          value: "en",
          editable: true,
          span: spanOf(node, source.sourceFile),
        },
      });
    });
    return findings;
  },
};
