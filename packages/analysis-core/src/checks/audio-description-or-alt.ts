import {
  ariaDescribedByPointsToTranscript,
  hasAdjacentTranscriptLink,
  hasChildTrackKind,
} from "./heuristic-utils";
import { locationOf, tagNameOf, visitJsxTags } from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

const DESCRIPTION_KINDS = new Set(["descriptions"]);

function hasAudioDescriptionAlternative(
  node: Parameters<typeof hasChildTrackKind>[0],
  sourceFile: Parameters<typeof ariaDescribedByPointsToTranscript>[1],
): boolean {
  if (hasChildTrackKind(node, DESCRIPTION_KINDS)) return true;
  if (hasAdjacentTranscriptLink(node)) return true;
  if (ariaDescribedByPointsToTranscript(node, sourceFile)) return true;
  return false;
}

export const audioDescriptionOrAltCheck: AccessibilityCheck = {
  id: "audio-description-or-alt",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "video") return;
      if (hasAudioDescriptionAlternative(node, source.sourceFile)) return;

      findings.push({
        checkId: "audio-description-or-alt",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "<video> has no descriptions track or adjacent transcript alternative; visual information not in the soundtrack may be inaccessible (WCAG 1.2.3).",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
