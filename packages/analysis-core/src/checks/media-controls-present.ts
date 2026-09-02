import { isPropSpreadingHost } from "../jsx-primitives";
import {
  getAttribute,
  locationOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";
import { hasAnyAttr } from "./heuristic-utils";

const MEDIA_TAGS = new Set(["video", "audio"]);

function hasNativeControls(node: JsxTagNode): boolean {
  return getAttribute(node, "controls") !== undefined;
}

function hasCustomPlayerKeyboard(node: JsxTagNode): boolean {
  const role = getAttribute(node, "role");
  const roleText = role?.initializer?.getText().toLowerCase() ?? "";
  if (roleText.includes("application")) {
    return hasAnyAttr(node, ["onKeyDown", "onKeyUp", "onKeyPress"]);
  }
  return hasAnyAttr(node, ["onKeyDown", "onKeyUp", "onKeyPress"]);
}

export const mediaControlsPresentCheck: AccessibilityCheck = {
  id: "media-controls-present",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (!MEDIA_TAGS.has(tag)) return;
      if (isPropSpreadingHost(node)) return;
      if (hasNativeControls(node)) return;
      if (hasCustomPlayerKeyboard(node)) return;

      findings.push({
        checkId: "media-controls-present",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason: `<${tag}> has no controls attribute and no keyboard handlers for a custom player, so keyboard users may not be able to operate the media.`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
