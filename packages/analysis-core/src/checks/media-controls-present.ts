import { isPropSpreadingHost } from "../jsx-primitives.ts";
import {
  getAttribute,
  locationOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";
import { hasKeyboardHandlers } from "./heuristic-utils.ts";

const MEDIA_TAGS = new Set(["video", "audio"]);

export const mediaControlsPresentCheck: AccessibilityCheck = {
  id: "media-controls-present",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (!MEDIA_TAGS.has(tag)) return;
      if (isPropSpreadingHost(node)) return;
      if (getAttribute(node, "controls") !== undefined) return;
      if (hasKeyboardHandlers(node)) return;

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
