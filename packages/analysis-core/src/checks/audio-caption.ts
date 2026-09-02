import {
  ariaDescribedByPointsToTranscript,
  hasAdjacentTranscriptLink,
  hasChildTrackKind,
} from "./heuristic-utils.js";
import { locationOf, tagNameOf, visitJsxTags } from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

const AUDIO_ALT_KINDS = new Set(["captions", "subtitles", "descriptions"]);

export const audioCaptionCheck: AccessibilityCheck = {
  id: "audio-caption",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "audio") return;
      if (hasChildTrackKind(node, AUDIO_ALT_KINDS)) return;
      if (hasAdjacentTranscriptLink(node)) return;
      if (ariaDescribedByPointsToTranscript(node, source.sourceFile)) return;

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
