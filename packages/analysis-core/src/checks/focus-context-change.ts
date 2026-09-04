import { isDecorativeOrHidden, isDomHost } from "../a11y-aria.ts";
import { isPropSpreadingHost } from "../jsx-primitives.ts";
import {
  locationOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.ts";
import { handlerTriggersContextChange, hasAnyAttr } from "./heuristic-utils.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

const FOCUS_HANDLERS = ["onFocus", "onfocus"];

export const focusContextChangeCheck: AccessibilityCheck = {
  id: "focus-context-change",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node: JsxTagNode) => {
      if (!isDomHost(tagNameOf(node))) return;
      if (isPropSpreadingHost(node)) return;
      if (isDecorativeOrHidden(node)) return;
      if (!hasAnyAttr(node, FOCUS_HANDLERS)) return;
      if (!handlerTriggersContextChange(node, FOCUS_HANDLERS)) return;
      findings.push({
        checkId: "focus-context-change",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason: `<${tagNameOf(node)}> onFocus handler appears to change context (navigate or submit). WCAG 3.2.1 requires focus not to trigger unexpected context changes.`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
