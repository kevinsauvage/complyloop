import { styleLocksTextSpacing } from "./heuristic-utils";
import { locationOf, visitJsxTags } from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

export const textSpacingCheck: AccessibilityCheck = {
  id: "text-spacing",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!styleLocksTextSpacing(node)) return;

      findings.push({
        checkId: "text-spacing",
        kind: "violation",
        severity: "moderate",
        confidence: "high",
        reason:
          "Inline letter-spacing, line-height, word-spacing, or paragraph-spacing uses !important, so users cannot override spacing to read the text.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
