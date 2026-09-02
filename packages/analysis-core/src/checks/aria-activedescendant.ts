import { isNativeInteractive, tabIndexValue } from "../a11y-model";
import { isPropSpreadingHost } from "../jsx-primitives";
import { getAttribute, locationOf, tagNameOf, visitJsxTags } from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

export const ariaActivedescendantCheck: AccessibilityCheck = {
  id: "aria-activedescendant",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!getAttribute(node, "aria-activedescendant")) return;
      if (isPropSpreadingHost(node)) return;
      if (isNativeInteractive(node)) return;
      const tabIndex = tabIndexValue(node);
      if (tabIndex !== undefined && tabIndex >= 0) return;

      findings.push({
        checkId: "aria-activedescendant",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason: `<${tagNameOf(node)}> uses aria-activedescendant but is not keyboard-focusable; composite widgets need tabIndex={0} (or a native control).`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
