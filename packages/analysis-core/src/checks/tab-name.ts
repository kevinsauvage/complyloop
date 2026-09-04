import { hasAriaName, isPropSpreadingHost } from "../jsx-primitives.ts";
import {
  getAttribute,
  hasTextContent,
  jsxElementOf,
  locationOf,
  stringValueOf,
  visitJsxTags,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

export const tabNameCheck: AccessibilityCheck = {
  id: "tab-name",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const role = getAttribute(node, "role");
      if ((role ? stringValueOf(role) : undefined) !== "tab") return;
      if (isPropSpreadingHost(node)) return;
      if (hasAriaName(node)) return;
      const element = jsxElementOf(node);
      if (element && hasTextContent(element)) return;

      findings.push({
        checkId: "tab-name",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          'role="tab" has no accessible name, so keyboard and screen reader users cannot tell the tabs apart.',
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
