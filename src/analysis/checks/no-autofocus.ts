import {
  attributeRemovalSpan,
  getAttribute,
  locationOf,
  visitJsxTags,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

export const noAutofocusCheck: AccessibilityCheck = {
  id: "no-autofocus",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const autoFocus =
        getAttribute(node, "autoFocus") ?? getAttribute(node, "autofocus");
      if (!autoFocus) return;

      findings.push({
        checkId: "no-autofocus",
        kind: "violation",
        severity: "moderate",
        confidence: "high",
        reason:
          "autoFocus moves keyboard focus on load, which can skip page context for keyboard and screen reader users.",
        location: locationOf(source, node),
        fix: {
          kind: "remove_attribute",
          attribute: autoFocus.name.getText(),
          span: attributeRemovalSpan(
            autoFocus,
            source.sourceFile,
            source.text,
          ),
        },
      });
    });
    return findings;
  },
};
