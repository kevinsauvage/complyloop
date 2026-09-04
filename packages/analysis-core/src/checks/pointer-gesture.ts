import { isDecorativeOrHidden, isDomHost } from "../a11y-aria.ts";
import { isNativeInteractive } from "../a11y-model.ts";
import { isPropSpreadingHost } from "../jsx-primitives.ts";
import {
  locationOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.ts";
import { hasAnyAttr, hasKeyboardHandlers } from "./heuristic-utils.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

export const pointerGestureCheck: AccessibilityCheck = {
  id: "pointer-gesture",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node: JsxTagNode) => {
      if (!isDomHost(tagNameOf(node))) return;
      if (isPropSpreadingHost(node)) return;
      if (isDecorativeOrHidden(node)) return;
      if (
        !hasAnyAttr(node, [
          "onPointerDown",
          "onTouchStart",
          "onPointerMove",
          "onTouchMove",
        ])
      ) {
        return;
      }
      if (isNativeInteractive(node)) return;
      if (hasKeyboardHandlers(node)) return;
      findings.push({
        checkId: "pointer-gesture",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason: `<${tagNameOf(node)}> handles a pointer or touch gesture without a keyboard equivalent (onKeyDown). Keyboard users cannot perform the path-dependent gesture.`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
