import { getAttribute, locationOf, stringValueOf } from "../parse.ts";
import { textContentOf, visitJsxElements } from "./heuristic-utils.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

const ERROR_RE = /(error|invalid|required|missing)/i;
const SUGGESTION_RE =
  /(should|try|enter|use|must|format|example|provide|correct|fix|change|type|value)/i;

export const errorSuggestionCheck: AccessibilityCheck = {
  id: "error-suggestion",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxElements(source.sourceFile, (element) => {
      const opening = element.openingElement;
      const role = getAttribute(opening, "role");
      const isAlert = role !== undefined && stringValueOf(role) === "alert";
      const isLive = getAttribute(opening, "aria-live") !== undefined;
      if (!isAlert && !isLive) return;
      const text = textContentOf(element);
      if (!ERROR_RE.test(text)) return;
      if (SUGGESTION_RE.test(text)) return;
      findings.push({
        checkId: "error-suggestion",
        kind: "warning",
        severity: "minor",
        confidence: "low",
        reason: "Error message does not appear to include a suggestion for correction. WCAG 3.3.3 expects errors to be described and a correction suggested.",
        location: locationOf(source, opening),
        fix: null,
      });
    });
    return findings;
  },
};
