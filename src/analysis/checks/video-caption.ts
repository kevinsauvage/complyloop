import { hasChildTrackKind } from "./heuristic-utils";
import { locationOf, tagNameOf, visitJsxTags } from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

const CAPTION_KINDS = new Set(["captions", "subtitles"]);

export const videoCaptionCheck: AccessibilityCheck = {
  id: "video-caption",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "video") return;
      if (hasChildTrackKind(node, CAPTION_KINDS)) return;

      findings.push({
        checkId: "video-caption",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          "<video> has no captions or subtitles track, so users who cannot hear the audio cannot follow the spoken content.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
