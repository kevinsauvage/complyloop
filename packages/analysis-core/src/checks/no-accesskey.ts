import { attributeRemovalSpan, getAttribute, locationOf, visitJsxTags } from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

export const noAccesskeyCheck: AccessibilityCheck = {
  id: "no-accesskey",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const attr =
        getAttribute(node, "accessKey") ?? getAttribute(node, "accesskey");
      if (!attr) return;

      findings.push({
        checkId: "no-accesskey",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          "accessKey creates a single-character keyboard shortcut that conflicts with assistive technology and cannot be remapped by the user.",
        location: locationOf(source, node),
        fix: {
          kind: "remove_attribute",
          attribute: attr.name.getText(),
          span: attributeRemovalSpan(attr, source.sourceFile, source.text),
        },
      });
    });
    return findings;
  },
};
