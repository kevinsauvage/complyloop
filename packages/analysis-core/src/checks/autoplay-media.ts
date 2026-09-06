import {
  attributeRemovalSpan,
  booleanAttributeValue,
  getAttribute,
  locationOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

export const autoplayMediaCheck: AccessibilityCheck = {
  id: "autoplay-media",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (tag !== "video" && tag !== "audio") return;
      const autoPlay =
        getAttribute(node, "autoPlay") ?? getAttribute(node, "autoplay");
      if (!autoPlay) return;
      // Only a statically-true autoPlay is a violation; `autoPlay={false}`,
      // `autoPlay="false"`, and dynamic expressions are not proven enabled.
      if (booleanAttributeValue(autoPlay) !== true) return;

      findings.push({
        checkId: "autoplay-media",
        kind: "violation",
        severity: "moderate",
        confidence: "high",
        reason: `<${tag}> uses autoPlay, which can disorient users and conflict with accessibility preferences for motion and sound.`,
        location: locationOf(source, node),
        fix: {
          kind: "remove_attribute",
          attribute: autoPlay.name.getText(),
          span: attributeRemovalSpan(
            autoPlay,
            source.sourceFile,
            source.text,
          ),
        },
      });
    });
    return findings;
  },
};
