import {
  DESCRIPTION_KINDS,
  hasTrackOrTranscriptAlt,
} from "./heuristic-utils.ts";
import { locationOf, tagNameOf, visitJsxTags } from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

export const audioDescriptionOrAltCheck: AccessibilityCheck = {
  id: "audio-description-or-alt",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "video") return;
      if (
        hasTrackOrTranscriptAlt(node, DESCRIPTION_KINDS, source.sourceFile)
      ) {
        return;
      }

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
