import { isComplexDataTable, isDataTable } from "./heuristic-utils.ts";
import { isPresentationRole } from "../a11y-aria.ts";
import { isPropSpreadingHost } from "../jsx-primitives.ts";
import {
  getAttribute,
  locationOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

function hasSummary(node: JsxTagNode): boolean {
  if (getAttribute(node, "summary")) return true;
  if (getAttribute(node, "aria-describedby")) return true;
  if (getAttribute(node, "aria-details")) return true;
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
      // The built-in complexity check now covers JSX-expression spans
      // (colSpan={4}) too — the shared definition, no per-check overrides.
      if (!isComplexDataTable(node)) return;
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