import { locationOf, tagNameOf, visitJsxTags } from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

const DISTRACTING = new Set(["marquee", "blink"]);

export const noBlinkMarqueeCheck: AccessibilityCheck = {
  id: "no-blink-marquee",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (!DISTRACTING.has(tag)) return;

      findings.push({
        checkId: "no-blink-marquee",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason: `<${tag}> moves or flashes content without a user-controlled pause, which can disorient users and trigger seizures.`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
