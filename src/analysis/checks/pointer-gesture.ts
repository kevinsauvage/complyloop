import { isAriaHidden, isDomHost, isPresentationRole } from "../a11y-aria";
import { isNativeInteractive } from "../a11y-model";
import { isPropSpreadingHost } from "../jsx-primitives";
import {
  locationOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse";
import { hasAnyAttr } from "./heuristic-utils";
import type { AccessibilityCheck, RawFinding } from "../types";

const KEY_HANDLERS = ["onKeyDown", "onKeyUp", "onKeyPress"];

export const pointerGestureCheck: AccessibilityCheck = {
  id: "pointer-gesture",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node: JsxTagNode) => {
      if (!isDomHost(tagNameOf(node))) return;
      if (isPropSpreadingHost(node)) return;
      if (isAriaHidden(node) || isPresentationRole(node)) return;
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
      if (hasAnyAttr(node, KEY_HANDLERS)) return;
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
