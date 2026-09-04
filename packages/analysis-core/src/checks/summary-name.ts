import { hasAriaName, isPropSpreadingHost } from "../jsx-primitives.ts";
import {
  hasTextContent,
  jsxElementOf,
  locationOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

export const summaryNameCheck: AccessibilityCheck = {
  id: "summary-name",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "summary") return;
      if (isPropSpreadingHost(node)) return;
      if (hasAriaName(node)) return;
      const element = jsxElementOf(node);
      if (element && hasTextContent(element)) return;

      findings.push({
        checkId: "summary-name",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          "<summary> has no accessible name, so disclosure controls are announced without a label.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
