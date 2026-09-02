import {
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

/** WCAG 1.4.4 — viewport must not prevent zooming/scaling. */
function viewportBlocksZoom(content: string): boolean {
  const normalized = content.toLowerCase().replace(/\s+/g, "");
  if (
    normalized.includes("user-scalable=no") ||
    normalized.includes("user-scalable=0") ||
    normalized.includes("user-scalable=false")
  ) {
    return true;
  }
  const maxScale = normalized.match(/maximum-scale=([0-9.]+)/);
  if (maxScale) {
    const value = Number.parseFloat(maxScale[1] ?? "");
    if (Number.isFinite(value) && value < 2) return true;
  }
  return false;
}

export const metaViewportCheck: AccessibilityCheck = {
  id: "meta-viewport",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "meta") return;
      const nameAttr = getAttribute(node, "name");
      const name = nameAttr ? stringValueOf(nameAttr) : undefined;
      if (name?.toLowerCase() !== "viewport") return;

      const contentAttr = getAttribute(node, "content");
      const content = contentAttr ? stringValueOf(contentAttr) : undefined;
      if (content === undefined) return;
      if (!viewportBlocksZoom(content)) return;

      findings.push({
        checkId: "meta-viewport",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          'Viewport meta disables zoom (user-scalable=no or maximum-scale < 2), which blocks users who need to enlarge text.',
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
