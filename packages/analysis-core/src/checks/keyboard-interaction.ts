import {
  isAriaHidden,
  isDomHost,
  isPresentationRole,
} from "../a11y-aria";
import {
  hasTabIndexAttribute,
  isExplicitWidgetRole,
  isNativeInteractive,
} from "../a11y-model";
import { isPropSpreadingHost } from "../jsx-primitives";
import {
  getAttribute,
  locationOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

const CLICK_HANDLERS = ["onClick", "onclick"];
const KEY_HANDLERS = [
  "onKeyDown",
  "onKeyUp",
  "onKeyPress",
  "onkeydown",
  "onkeyup",
  "onkeypress",
];
const MOUSE_OVER = ["onMouseOver", "onmouseover"];
const MOUSE_OUT = ["onMouseOut", "onmouseout"];
const FOCUS_HANDLERS = ["onFocus", "onfocus"];
const BLUR_HANDLERS = ["onBlur", "onblur"];

function hasAny(node: JsxTagNode, names: string[]): boolean {
  return names.some((name) => getAttribute(node, name) !== undefined);
}

export const keyboardInteractionCheck: AccessibilityCheck = {
  id: "keyboard-interaction",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!isDomHost(tagNameOf(node))) return;
      if (isPropSpreadingHost(node)) return;
      if (isAriaHidden(node) || isPresentationRole(node)) return;

      const native = isNativeInteractive(node);
      const click = hasAny(node, CLICK_HANDLERS);
      const hoverIn = hasAny(node, MOUSE_OVER);
      const hoverOut = hasAny(node, MOUSE_OUT);
      if (!click && !hoverIn && !hoverOut) return;

      const problems: string[] = [];
      if (click && !native) {
        if (!hasAny(node, KEY_HANDLERS)) {
          problems.push("a keyboard listener (onKeyDown / onKeyUp)");
        }
        if (!isExplicitWidgetRole(node)) {
          problems.push("an interactive role");
        }
        if (!hasTabIndexAttribute(node)) {
          problems.push("tabIndex so it can receive focus");
        }
      }
      if (hoverIn && !hasAny(node, FOCUS_HANDLERS)) {
        problems.push("onFocus to match onMouseOver");
      }
      if (hoverOut && !hasAny(node, BLUR_HANDLERS)) {
        problems.push("onBlur to match onMouseOut");
      }
      if (problems.length === 0) return;

      findings.push({
        checkId: "keyboard-interaction",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason: `<${tagNameOf(node)}> handles pointer events without ${problems.join(", ")}. Keyboard users cannot operate it.`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
