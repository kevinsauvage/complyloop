import { explicitRoles, isDecorativeOrHidden } from "../a11y-aria.ts";
import { hasAriaName, isPropSpreadingHost } from "../jsx-primitives.ts";
import {
  hasTextContent,
  jsxElementOf,
  locationOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";
import { descendantTags, isInsideNamingHost } from "./heuristic-utils.ts";

function hasTitleChild(node: Parameters<typeof tagNameOf>[0]): boolean {
  const element = jsxElementOf(node);
  if (!element) return false;
  return descendantTags(element).some((tag) => {
    if (tagNameOf(tag) !== "title") return false;
    const titleElement = jsxElementOf(tag);
    return titleElement ? hasTextContent(titleElement) : false;
  });
}

export const svgNameCheck: AccessibilityCheck = {
  id: "svg-name",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "svg") return;
      if (isPropSpreadingHost(node)) return;
      if (isDecorativeOrHidden(node)) return;
      if (isInsideNamingHost(node)) return;
      const informative = hasAriaName(node) || hasTitleChild(node);
      if (!informative) {
        findings.push({
          checkId: "svg-name",
          kind: "violation",
          severity: "serious",
          confidence: "high",
          reason:
            "Standalone <svg> has no accessible name (title, aria-label, or aria-labelledby) and is not marked decorative.",
          location: locationOf(source, node),
          fix: null,
        });
        return;
      }
      if (explicitRoles(node).includes("img")) return;

      findings.push({
        checkId: "svg-name",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          'Standalone <svg> that conveys information must set role="img" (RGAA 1.1.5).',
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
