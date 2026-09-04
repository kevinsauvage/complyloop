import { hasChildTrackKind } from "./heuristic-utils.ts";
import {
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";
import { CAPTION_KINDS } from "./heuristic-utils.ts";

const LIVE_HINT = /live|stream|broadcast|\.m3u8/i;

function isLiveMedia(node: JsxTagNode): boolean {
  const src = getAttribute(node, "src");
  const srcValue = src ? stringValueOf(src) : undefined;
  if (srcValue && LIVE_HINT.test(srcValue)) return true;
  return getAttribute(node, "data-live") !== undefined;
}

export const captionsLiveCheck: AccessibilityCheck = {
  id: "captions-live",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "video") return;
      if (!isLiveMedia(node)) return;
      if (hasChildTrackKind(node, CAPTION_KINDS)) return;

      findings.push({
        checkId: "captions-live",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "Live or streaming <video> has no captions track; synchronized live audio may be inaccessible (WCAG 1.2.4).",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
