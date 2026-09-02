import { isAriaHidden, isDomHost, isPresentationRole } from "../a11y-aria.js";
import { isNativeInteractive } from "../a11y-model.js";
import { isPropSpreadingHost } from "../jsx-primitives.js";
import {
  booleanAttributeValue,
  getAttribute,
  locationOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.js";
import { hasAnyAttr } from "./heuristic-utils.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

const KEY_HANDLERS = ["onKeyDown", "onKeyUp", "onKeyPress"];
const DRAG_HANDLERS = ["onDrag", "onDragStart", "onDragEnd", "onDrop"];

export const draggingCheck: AccessibilityCheck = {
  id: "dragging",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node: JsxTagNode) => {
      if (!isDomHost(tagNameOf(node))) return;
      if (isPropSpreadingHost(node)) return;
      if (isAriaHidden(node) || isPresentationRole(node)) return;

      const draggable = getAttribute(node, "draggable");
      const isDraggable =
        draggable !== undefined &&
        (booleanAttributeValue(draggable) === true ||
          stringValueIsTrue(draggable));
      const hasDragHandler = hasAnyAttr(node, DRAG_HANDLERS);
      if (!isDraggable && !hasDragHandler) return;
      if (isNativeInteractive(node)) return;
      if (hasAnyAttr(node, KEY_HANDLERS)) return;

      findings.push({
        checkId: "dragging",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason: `<${tagNameOf(node)}> supports drag-and-drop without a keyboard alternative (onKeyDown). Provide buttons or inputs for single-pointer users (WCAG 2.5.7).`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

function stringValueIsTrue(attr: NonNullable<ReturnType<typeof getAttribute>>): boolean {
  const text = attr.initializer?.getText().replace(/['"]/g, "");
  return text === "true";
}
