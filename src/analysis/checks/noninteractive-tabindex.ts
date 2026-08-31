import {
  isExplicitWidgetRole,
  isNativeInteractive,
  tabIndexValue,
} from "../a11y-model";
import { isPropSpreadingHost } from "../jsx-primitives";
import { getAttribute, locationOf, tagNameOf, visitJsxTags } from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

const GENERIC_HOSTS = new Set(["div", "span"]);
const KEY_HANDLERS = [
  "onKeyDown",
  "onKeyUp",
  "onKeyPress",
  "onkeydown",
  "onkeyup",
  "onkeypress",
];

export const noninteractiveTabindexCheck: AccessibilityCheck = {
  id: "noninteractive-tabindex",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!GENERIC_HOSTS.has(tagNameOf(node).toLowerCase())) return;
      if (isPropSpreadingHost(node)) return;
      if (tabIndexValue(node) !== 0) return;
      if (isNativeInteractive(node) || isExplicitWidgetRole(node)) return;
      if (KEY_HANDLERS.some((name) => getAttribute(node, name) !== undefined)) {
        return;
      }

      findings.push({
        checkId: "noninteractive-tabindex",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          "tabIndex={0} on a non-interactive element puts it in the tab order without a widget role or keyboard handler.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
