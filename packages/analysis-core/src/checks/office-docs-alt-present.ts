import ts from "typescript";
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
import { textContentOf } from "./heuristic-utils.ts";

const OFFICE_DOC_HREF = /\.(pdf|docx?|odt|pptx?|xlsx?)(\?|#|$)/i;
const HTML_ALTERNATIVE_HREF = /\.(html?|txt)(\?|#|$)/i;

function hrefOf(node: JsxTagNode): string | undefined {
  const href = getAttribute(node, "href");
  return href ? stringValueOf(href) : undefined;
}

function hasAdjacentHtmlAlternative(node: JsxTagNode): boolean {
  const self = ts.isJsxOpeningElement(node) ? node.parent : node;
  const parent = self.parent;
  if (!ts.isJsxElement(parent) && !ts.isJsxFragment(parent)) return false;
  const siblings = parent.children;
  const index = siblings.indexOf(self);
  if (index < 0) return false;

  for (let current = index + 1; current < siblings.length; current += 1) {
    const sibling = siblings[current];
    if (!sibling) continue;
    if (ts.isJsxText(sibling) && sibling.text.trim().length === 0) continue;
    const siblingTag = ts.isJsxElement(sibling)
      ? sibling.openingElement
      : ts.isJsxSelfClosingElement(sibling)
        ? sibling
        : undefined;
    if (!siblingTag) return false;
    if (tagNameOf(siblingTag) !== "a") return false;
    const href = hrefOf(siblingTag);
    if (href && HTML_ALTERNATIVE_HREF.test(href)) return true;
    if (!ts.isJsxElement(sibling)) return false;
    return textContentOf(sibling).trim().length > 20;
  }
  return false;
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
