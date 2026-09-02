import ts from "typescript";
import { isPropSpreadingHost } from "../jsx-primitives.js";
import {
  jsxElementOf,
  locationOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";
import { descendantTags } from "./heuristic-utils.js";

const IMAGE_TAGS = new Set(["img", "Image", "svg", "picture"]);

function hasImage(element: ts.JsxElement): boolean {
  return descendantTags(element).some((tag) => IMAGE_TAGS.has(tagNameOf(tag)));
}

function hasFigcaption(element: ts.JsxElement): boolean {
  return descendantTags(element).some((tag) => tagNameOf(tag) === "figcaption");
}

function hasUnassociatedCaption(element: ts.JsxElement): boolean {
  for (const child of element.children) {
    if (ts.isJsxText(child) && child.text.trim().length > 0) return true;
    if (ts.isJsxExpression(child) && child.expression) return true;
    const tag: Parameters<typeof tagNameOf>[0] | undefined = ts.isJsxSelfClosingElement(
      child,
    )
      ? child
      : ts.isJsxElement(child)
        ? child.openingElement
        : undefined;
    if (!tag) continue;
    const name = tagNameOf(tag);
    if (name === "figcaption" || IMAGE_TAGS.has(name)) continue;
    return true;
  }
  return false;
}

export const figureCaptionCheck: AccessibilityCheck = {
  id: "figure-caption",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "figure") return;
      if (isPropSpreadingHost(node)) return;
      const element = jsxElementOf(node);
      if (!element) return;
      if (!hasImage(element)) return;
      if (hasFigcaption(element)) return;
      if (!hasUnassociatedCaption(element)) return;

      findings.push({
        checkId: "figure-caption",
        kind: "violation",
        severity: "serious",
        confidence: "medium",
        reason:
          "<figure> has caption-like content that is not in a <figcaption>, so the association is not programmatically determinable.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
