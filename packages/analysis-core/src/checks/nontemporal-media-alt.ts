import { isDecorativeOrHidden } from "../a11y-aria.ts";
import { hasAriaName, isPropSpreadingHost } from "../jsx-primitives.ts";
import {
  getAttribute,
  hasTextContent,
  jsxElementOf,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";
import { hasAdjacentTagMatching } from "./heuristic-utils.ts";

const NON_TEMPORAL_MEDIA_TAGS = new Set(["object", "embed", "canvas"]);
const IMAGE_MIME = /^image\//i;
const TEMPORAL_MIME = /^(audio|video)\//i;
const TEXT_ALTERNATIVE_HOSTS = new Set(["a", "button"]);

function hasAdjacentAlternative(node: JsxTagNode): boolean {
  return hasAdjacentTagMatching(node, (siblingTag, siblingElement) => {
    if (!TEXT_ALTERNATIVE_HOSTS.has(tagNameOf(siblingTag))) return false;
    if (hasAriaName(siblingTag)) return true;
    if (!siblingElement) return false;
    return hasTextContent(siblingElement);
  });
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
      if (isDecorativeOrHidden(node)) return;
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
