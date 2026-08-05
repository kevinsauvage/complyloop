import {
  getAttribute,
  locationOf,
  spanOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

export const iframeTitleCheck: AccessibilityCheck = {
  id: "iframe-title",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "iframe") return;
      const title = getAttribute(node, "title");
      const titleText = title ? stringValueOf(title) : undefined;
      if (titleText !== undefined && titleText.trim().length > 0) return;

      findings.push({
        checkId: "iframe-title",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          "<iframe> has no title, so assistive technologies cannot describe the embedded frame.",
        location: locationOf(source, node),
        fix: {
          kind: "insert_attribute",
          attribute: "title",
          value: "Describe this embedded content",
          editable: true,
          span: spanOf(node, source.sourceFile),
        },
      });
    });
    return findings;
  },
};
