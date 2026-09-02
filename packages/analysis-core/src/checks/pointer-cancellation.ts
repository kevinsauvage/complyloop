import { isAriaHidden, isDomHost, isPresentationRole } from "../a11y-aria.js";
import { isPropSpreadingHost } from "../jsx-primitives.js";
import {
  locationOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.js";
import { hasAnyAttr } from "./heuristic-utils.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

export const pointerCancellationCheck: AccessibilityCheck = {
  id: "pointer-cancellation",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node: JsxTagNode) => {
      if (!isDomHost(tagNameOf(node))) return;
      if (isPropSpreadingHost(node)) return;
      if (isAriaHidden(node) || isPresentationRole(node)) return;
      if (!hasAnyAttr(node, ["onPointerDown", "onMouseDown"])) return;
      if (hasAnyAttr(node, ["onPointerUp", "onPointerCancel", "onMouseUp"])) {
        return;
      }
      findings.push({
        checkId: "pointer-cancellation",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason: `<${tagNameOf(node)}> starts a pointer action (pointerdown/mousedown) without a pointerup/pointercancel counterpart, so the action may not be abortable by moving the pointer away (WCAG 2.5.2).`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
