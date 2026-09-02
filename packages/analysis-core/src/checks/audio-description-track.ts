import { hasChildTrackKind } from "./heuristic-utils.js";
import { locationOf, tagNameOf, visitJsxTags } from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

const DESCRIPTION_KINDS = new Set(["descriptions"]);

export const audioDescriptionTrackCheck: AccessibilityCheck = {
  id: "audio-description-track",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "video") return;
      if (hasChildTrackKind(node, DESCRIPTION_KINDS)) return;

      findings.push({
        checkId: "audio-description-track",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "<video> has no descriptions track; visual information not in the soundtrack may be missing for blind users (RGAA 4.5).",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
