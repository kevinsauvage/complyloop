import { isPropSpreadingHost } from "../jsx-primitives";
import { isAriaHidden, isPresentationRole } from "../a11y-aria";
import {
  locationOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";
import { hasAnyAttr } from "./heuristic-utils";

const STATIC_MEDIA_TAGS = new Set(["object", "embed"]);

function hasKeyboardPath(node: JsxTagNode): boolean {
  return hasAnyAttr(node, [
    "tabIndex",
    "tabindex",
    "onKeyDown",
    "onKeyUp",
    "onKeyPress",
  ]);
}

export const mediaKeyboardStaticCheck: AccessibilityCheck = {
  id: "media-keyboard-static",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (!STATIC_MEDIA_TAGS.has(tag)) return;
      if (isPropSpreadingHost(node)) return;
      if (isAriaHidden(node) || isPresentationRole(node)) return;
      if (hasKeyboardPath(node)) return;

      findings.push({
        checkId: "media-keyboard-static",
        kind: "violation",
        severity: "serious",
        confidence: "medium",
        reason: `<${tag}> has no keyboard handlers or tabIndex, so keyboard users may not be able to operate the embedded content (RGAA 4.12).`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
