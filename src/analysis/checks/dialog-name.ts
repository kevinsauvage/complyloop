import { hasAriaName, isPropSpreadingHost } from "../jsx-primitives";
import {
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

function isDialog(node: Parameters<typeof tagNameOf>[0]): boolean {
  if (tagNameOf(node) === "dialog") return true;
  const role = getAttribute(node, "role");
  const value = role ? stringValueOf(role) : undefined;
  return value === "dialog" || value === "alertdialog";
}

export const dialogNameCheck: AccessibilityCheck = {
  id: "dialog-name",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!isDialog(node)) return;
      if (isPropSpreadingHost(node)) return;
      if (hasAriaName(node)) return;

      findings.push({
        checkId: "dialog-name",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          "Dialog has no accessible name (aria-label, aria-labelledby, or title), so screen reader users hear only “dialog” with no title.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
