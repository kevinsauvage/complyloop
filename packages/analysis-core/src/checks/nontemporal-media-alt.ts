import ts from "typescript";
import { isAriaHidden, isPresentationRole } from "../a11y-aria.js";
import { hasAriaName, isPropSpreadingHost } from "../jsx-primitives.js";
import {
  getAttribute,
  hasTextContent,
  jsxElementOf,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

const NON_TEMPORAL_MEDIA_TAGS = new Set(["object", "embed", "canvas"]);
const IMAGE_MIME = /^image\//i;
const TEMPORAL_MIME = /^(audio|video)\//i;
const TEXT_ALTERNATIVE_HOSTS = new Set(["a", "button"]);

function hasAdjacentAlternative(node: JsxTagNode): boolean {
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
    if (!TEXT_ALTERNATIVE_HOSTS.has(tagNameOf(siblingTag))) return false;
    if (hasAriaName(siblingTag)) return true;
    if (!ts.isJsxElement(sibling)) return false;
    return hasTextContent(sibling);
  }
  return false;
}

function isSkippedTypedMedia(node: JsxTagNode): boolean {
  const typeAttribute = getAttribute(node, "type");
  const typeValue = typeAttribute ? stringValueOf(typeAttribute) : undefined;
  if (!typeValue) return false;
  return IMAGE_MIME.test(typeValue) || TEMPORAL_MIME.test(typeValue);
}

export const nontemporalMediaAltCheck: AccessibilityCheck = {
  id: "nontemporal-media-alt",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (!NON_TEMPORAL_MEDIA_TAGS.has(tag)) return;
      if (isPropSpreadingHost(node)) return;
      if (isAriaHidden(node) || isPresentationRole(node)) return;
      if ((tag === "object" || tag === "embed") && isSkippedTypedMedia(node)) return;
      if (hasAriaName(node)) return;
      if (tag === "canvas") {
        const element = jsxElementOf(node);
        if (element && hasTextContent(element)) return;
      }
      if (hasAdjacentAlternative(node)) return;

      findings.push({
        checkId: "nontemporal-media-alt",
        kind: "violation",
        severity: "serious",
        confidence: "medium",
        reason:
          `<${tag}> does not expose a text alternative. Add an accessible name or an adjacent link/button alternative.`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
