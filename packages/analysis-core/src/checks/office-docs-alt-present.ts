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
import { hasAdjacentTagMatching, textContentOf } from "./heuristic-utils.ts";

const OFFICE_DOC_HREF = /\.(pdf|docx?|odt|pptx?|xlsx?)(\?|#|$)/i;
const HTML_ALTERNATIVE_HREF = /\.(html?|txt)(\?|#|$)/i;

function hrefOf(node: JsxTagNode): string | undefined {
  const href = getAttribute(node, "href");
  return href ? stringValueOf(href) : undefined;
}

function hasAdjacentHtmlAlternative(node: JsxTagNode): boolean {
  return hasAdjacentTagMatching(node, (siblingTag, siblingElement) => {
    if (tagNameOf(siblingTag) !== "a") return false;
    const href = hrefOf(siblingTag);
    if (href && HTML_ALTERNATIVE_HREF.test(href)) return true;
    if (!siblingElement) return false;
    return textContentOf(siblingElement).trim().length > 20;
  });
}

export const officeDocsAltPresentCheck: AccessibilityCheck = {
  id: "office-docs-alt-present",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (tag !== "a" && tag !== "Link") return;
      if (isPropSpreadingHost(node)) return;
      const href = hrefOf(node);
      if (!href || !OFFICE_DOC_HREF.test(href)) return;
      if (hasAdjacentHtmlAlternative(node)) return;

      findings.push({
        checkId: "office-docs-alt-present",
        kind: "warning",
        severity: "moderate",
        confidence: "medium",
        reason:
          "Downloadable office document link has no adjacent HTML or text alternative (RGAA 13.3).",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
