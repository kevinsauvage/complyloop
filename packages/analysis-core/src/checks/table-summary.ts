import ts from "typescript";
import { isPresentationRole } from "../a11y-aria.ts";
import { isPropSpreadingHost } from "../jsx-primitives.ts";
import {
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";
import { isComplexDataTable, isDataTable } from "./heuristic-utils.ts";

function hasSummary(node: JsxTagNode): boolean {
  if (getAttribute(node, "summary")) return true;
  if (getAttribute(node, "aria-describedby")) return true;
  if (getAttribute(node, "aria-details")) return true;
  return false;
}

function spanExceedsOne(node: JsxTagNode): boolean {
  const attr = getAttribute(node, "colSpan") ?? getAttribute(node, "colspan");
  if (!attr) return false;
  const value = stringValueOf(attr);
  if (value !== undefined) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 1;
  }
  if (attr.initializer && ts.isJsxExpression(attr.initializer)) {
    const text = attr.initializer.expression?.getText() ?? "";
    const match = text.match(/\d+/);
    return match !== null && Number.parseInt(match[0], 10) > 1;
  }
  return false;
}

export const tableSummaryCheck: AccessibilityCheck = {
  id: "table-summary",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "table") return;
      if (isPropSpreadingHost(node)) return;
      if (isPresentationRole(node)) return;
      if (!isDataTable(node)) return;
      if (!isComplexDataTable(node, { spanExceedsOne })) return;
      if (hasSummary(node)) return;

      findings.push({
        checkId: "table-summary",
        kind: "violation",
        severity: "serious",
        confidence: "medium",
        reason:
          "Complex data table has no summary, aria-describedby, or aria-details, so users may not understand the table structure before reading cells.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
