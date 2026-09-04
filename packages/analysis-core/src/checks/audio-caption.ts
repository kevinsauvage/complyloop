import {
  AUDIO_ALT_KINDS,
  hasTrackOrTranscriptAlt,
} from "./heuristic-utils.ts";
import { locationOf, tagNameOf, visitJsxTags } from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

export const audioCaptionCheck: AccessibilityCheck = {
  id: "audio-caption",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "audio") return;
      if (hasTrackOrTranscriptAlt(node, AUDIO_ALT_KINDS, source.sourceFile)) {
        return;
      }

      findings.push({
        checkId: "audio-caption",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          "<audio> has no captions or descriptions track, so users who cannot hear the audio have no equivalent.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
