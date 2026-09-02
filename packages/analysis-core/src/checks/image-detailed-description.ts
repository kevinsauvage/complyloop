import { isPropSpreadingHost } from "../jsx-primitives.js";
import {
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";
import { isInsideNamingHost } from "./heuristic-utils.js";

const COMPLEX_SRC = /chart|graph|diagram|map|plot|infographic/i;
const LONG_ALT_THRESHOLD = 80;

function hasDetailedDescription(node: JsxTagNode): boolean {
  return (
    getAttribute(node, "aria-describedby") !== undefined ||
    getAttribute(node, "aria-details") !== undefined ||
    getAttribute(node, "longdesc") !== undefined
  );
}

function isLikelyComplexImage(node: JsxTagNode): boolean {
  const altAttr = getAttribute(node, "alt");
  const alt = altAttr ? stringValueOf(altAttr) : undefined;
  if (alt === "") return false;

  const srcAttr = getAttribute(node, "src");
  const src = srcAttr ? stringValueOf(srcAttr) : undefined;
  if (src && COMPLEX_SRC.test(src)) return true;

  if (alt && alt.length >= LONG_ALT_THRESHOLD) return true;

  return false;
}

export const imageDetailedDescriptionCheck: AccessibilityCheck = {
  id: "image-detailed-description",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (tag !== "img" && tag !== "Image") return;
      if (isPropSpreadingHost(node)) return;
      if (isInsideNamingHost(node)) return;
      if (!isLikelyComplexImage(node)) return;
      if (hasDetailedDescription(node)) return;

      findings.push({
        checkId: "image-detailed-description",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "Image may be complex (long alt or chart-like source) but has no aria-describedby, aria-details, or longdesc for a detailed description.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
