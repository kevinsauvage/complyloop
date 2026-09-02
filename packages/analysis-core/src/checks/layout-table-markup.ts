import { isPresentationRole } from "../a11y-aria.js";
import { isPropSpreadingHost } from "../jsx-primitives.js";
import {
  getAttribute,
  jsxElementOf,
  locationOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";
import { descendantTags } from "./heuristic-utils.js";

const DATA_TABLE_TAGS = new Set(["th", "caption"]);
const DATA_TABLE_ATTRS = ["headers", "scope"];

function hasDataTableMarkup(node: Parameters<typeof tagNameOf>[0]): boolean {
  const element = jsxElementOf(node);
  if (!element) return false;
  return descendantTags(element).some((tag) => {
    if (DATA_TABLE_TAGS.has(tagNameOf(tag))) return true;
    return DATA_TABLE_ATTRS.some((name) => getAttribute(tag, name) !== undefined);
  });
}

export const layoutTableMarkupCheck: AccessibilityCheck = {
  id: "layout-table-markup",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "table") return;
      if (isPropSpreadingHost(node)) return;
      if (!isPresentationRole(node)) return;
      if (!hasDataTableMarkup(node)) return;

      findings.push({
        checkId: "layout-table-markup",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          "Layout table (role=\"presentation\") still has header/caption markup, which assistive technologies treat as a data table.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
