import { isAriaHidden, isDomHost, isPresentationRole } from "../a11y-aria";
import { isPropSpreadingHost } from "../jsx-primitives";
import {
  locationOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse";
import { handlerTriggersContextChange, hasAnyAttr } from "./heuristic-utils";
import type { AccessibilityCheck, RawFinding } from "../types";

const INPUT_HANDLERS = [
  "onChange",
  "onInput",
  "onBlur",
  "onchange",
  "oninput",
  "onblur",
];

export const inputContextChangeCheck: AccessibilityCheck = {
  id: "input-context-change",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node: JsxTagNode) => {
      if (!isDomHost(tagNameOf(node))) return;
      if (isPropSpreadingHost(node)) return;
      if (isAriaHidden(node) || isPresentationRole(node)) return;
      if (!hasAnyAttr(node, INPUT_HANDLERS)) return;
      if (!handlerTriggersContextChange(node, INPUT_HANDLERS)) return;
      findings.push({
        checkId: "input-context-change",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason: `<${tagNameOf(node)}> input handler appears to change context (navigate or submit) without warning. WCAG 3.2.2 requires input not to trigger unexpected context changes.`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
