import { isPresentationRole } from "../a11y-aria.js";
import { hasAriaName, isPropSpreadingHost } from "../jsx-primitives.js";
import {
  jsxElementOf,
  locationOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";
import { descendantTags } from "./heuristic-utils.js";

function isDataTable(node: Parameters<typeof tagNameOf>[0]): boolean {
  const element = jsxElementOf(node);
  if (!element) return false;
  return descendantTags(element).some((tag) => tagNameOf(tag) === "th");
}

function hasCaption(node: Parameters<typeof tagNameOf>[0]): boolean {
  if (hasAriaName(node)) return true;
  const element = jsxElementOf(node);
  if (!element) return false;
  return descendantTags(element).some((tag) => tagNameOf(tag) === "caption");
}

export const tableCaptionCheck: AccessibilityCheck = {
  id: "table-caption",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "table") return;
      if (isPropSpreadingHost(node)) return;
      if (isPresentationRole(node)) return;
      if (!isDataTable(node)) return;
      if (hasCaption(node)) return;

      findings.push({
        checkId: "table-caption",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          "Data table has no <caption> or accessible name, so users cannot tell what the table is about.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
