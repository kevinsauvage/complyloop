import { hasAriaName, isPropSpreadingHost } from "../jsx-primitives.js";
import {
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

export const optgroupCheck: AccessibilityCheck = {
  id: "optgroup",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "optgroup") return;
      if (isPropSpreadingHost(node)) return;
      if (hasAriaName(node)) return;

      const label = getAttribute(node, "label");
      if (label) {
        const value = stringValueOf(label);
        if (value === undefined || value.trim().length > 0) return;
      }

      findings.push({
        checkId: "optgroup",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          "<optgroup> has no label, so assistive technologies cannot announce the group name.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
