import ts from "typescript";
import {
  locationOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

const LIST_TAGS = new Set(["ul", "ol", "menu"]);

function enclosingJsxElement(node: ts.Node): ts.JsxElement | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxElement(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function parentListTag(node: JsxTagNode): string | undefined {
  const element = enclosingJsxElement(node);
  // The enclosing element for an opening tag is often the element itself —
  // walk one more level to the parent container.
  const container =
    element && element.openingElement === node
      ? enclosingJsxElement(element)
      : element;
  if (!container) return undefined;
  return tagNameOf(container.openingElement);
}

export const listStructureCheck: AccessibilityCheck = {
  id: "list-structure",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);

      if (tag === "li") {
        const parent = parentListTag(node);
        if (!parent || !LIST_TAGS.has(parent)) {
          findings.push({
            checkId: "list-structure",
            kind: "violation",
            severity: "moderate",
            confidence: parent ? "high" : "medium",
            reason: parent
              ? `<li> must be a direct child of <ul>, <ol>, or <menu> (found under <${parent}>).`
              : "<li> has no list parent in this file; wrap it in <ul>, <ol>, or <menu>.",
            location: locationOf(source, node),
            fix: null,
          });
        }
        return;
      }

      if (!LIST_TAGS.has(tag)) return;
      const element = enclosingJsxElement(node);
      if (!element || element.openingElement !== node) return;

      for (const child of element.children) {
        if (ts.isJsxElement(child)) {
          const childTag = tagNameOf(child.openingElement);
          if (childTag !== "li") {
            findings.push({
              checkId: "list-structure",
              kind: "violation",
              severity: "moderate",
              confidence: "high",
              reason: `<${tag}> contains a direct <${childTag}> child; list children must be <li>.`,
              location: locationOf(source, child.openingElement),
              fix: null,
            });
          }
        } else if (ts.isJsxSelfClosingElement(child)) {
          const childTag = tagNameOf(child);
          if (childTag !== "li") {
            findings.push({
              checkId: "list-structure",
              kind: "violation",
              severity: "moderate",
              confidence: "high",
              reason: `<${tag}> contains a direct <${childTag}> child; list children must be <li>.`,
              location: locationOf(source, child),
              fix: null,
            });
          }
        }
      }
    });
    return findings;
  },
};
