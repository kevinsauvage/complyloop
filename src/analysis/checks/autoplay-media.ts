import {
  getAttribute,
  locationOf,
  tagNameOf,
  visitJsxTags,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

export const autoplayMediaCheck: AccessibilityCheck = {
  id: "autoplay-media",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (tag !== "video" && tag !== "audio") return;
      const autoPlay = getAttribute(node, "autoPlay") ?? getAttribute(node, "autoplay");
      if (!autoPlay) return;

      findings.push({
        checkId: "autoplay-media",
        kind: "violation",
        severity: "moderate",
        confidence: "high",
        reason: `<${tag}> uses autoPlay, which can disorient users and conflict with accessibility preferences for motion and sound.`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};