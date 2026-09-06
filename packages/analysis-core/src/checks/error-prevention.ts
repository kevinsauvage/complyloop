import ts from "typescript";
import {
  AGREE_LABEL,
  CONFIRM_LABEL,
  HIGH_RISK,
  matchesMultilingual,
} from "../patterns/multilingual.ts";
import {
  descendantTags,
  textContentOf,
  visitJsxElements,
} from "./heuristic-utils.ts";
import {
  getAttribute,
  jsxElementOf,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

function collectFormHosts(sourceFile: ts.SourceFile): JsxTagNode[] {
  const hosts: JsxTagNode[] = [];
  visitJsxTags(sourceFile, (node) => {
    if (tagNameOf(node) === "form") hosts.push(node);
  });
  return hosts;
}

function textAroundForm(formNode: JsxTagNode): string {
  const parts: string[] = [];
  const element = jsxElementOf(formNode);
  if (element) parts.push(textContentOf(element));
  for (const name of ["name", "id", "aria-label", "action"]) {
    const attr = getAttribute(formNode, name);
    const value = attr ? stringValueOf(attr) : undefined;
    if (value) parts.push(value);
  }
  return parts.join(" ");
}

function subtreeHasSafeguard(formNode: JsxTagNode): boolean {
  const element = jsxElementOf(formNode);
  if (!element) return false;

  for (const tag of descendantTags(element)) {
    const tagName = tagNameOf(tag);
    if (tagName === "input") {
      const typeAttr = getAttribute(tag, "type");
      const type = (typeAttr ? stringValueOf(typeAttr) : "text") ?? "text";
      if (type === "checkbox") {
        const labelText = accessibleTextOf(tag, element);
        if (AGREE_LABEL.test(labelText)) return true;
      }
    }

    if (tagName === "button") {
      const typeAttr = getAttribute(tag, "type");
      const type = typeAttr ? stringValueOf(typeAttr)?.toLowerCase() : "submit";
      const labelText = accessibleTextOf(tag, element);
      if (
        matchesMultilingual(CONFIRM_LABEL, labelText) ||
        matchesMultilingual(AGREE_LABEL, labelText)
      ) {
        return true;
      }
      if (type === "button") {
        continue;
      }
    }
  }

  for (const name of ["data-confirm", "data-review-step", "data-confirm-submit"]) {
    if (getAttribute(formNode, name)) return true;
  }

  return false;
}

function accessibleTextOf(tag: JsxTagNode, formElement: ts.JsxElement): string {
  const ariaLabel = getAttribute(tag, "aria-label");
  const ariaValue = ariaLabel ? stringValueOf(ariaLabel) : undefined;
  if (ariaValue) return ariaValue;
  const child = jsxElementOf(tag);
  if (child) return textContentOf(child);
  return textContentOf(formElement);
}

function handlerUsesConfirm(formNode: JsxTagNode): boolean {
  for (const name of ["onSubmit", "onClick"]) {
    const attr = getAttribute(formNode, name);
    if (!attr?.initializer || !ts.isJsxExpression(attr.initializer)) continue;
    const expression = attr.initializer.expression;
    if (!expression) continue;
    if (/\bconfirm\s*\(/.test(expression.getText())) return true;
  }
  return false;
}

export const errorPreventionCheck: AccessibilityCheck = {
  id: "error-prevention",
  run(source) {
    const findings: RawFinding[] = [];
    const forms = collectFormHosts(source.sourceFile);

    for (const formNode of forms) {
      const context = textAroundForm(formNode);
      if (!matchesMultilingual(HIGH_RISK, context)) continue;
      if (
        subtreeHasSafeguard(formNode) ||
        handlerUsesConfirm(formNode)
      ) {
        continue;
      }

      findings.push({
        checkId: "error-prevention",
        kind: "warning",
        severity: "serious",
        confidence: "medium",
        reason:
          "High-impact form may submit without a review, confirm, or agreement step (WCAG 3.3.4 / RGAA 11.12).",
        location: locationOf(source, formNode),
        fix: null,
      });
    }

    visitJsxElements(source.sourceFile, (element) => {
      const opening = element.openingElement;
      if (tagNameOf(opening) === "form") return;
      const text = textContentOf(element);
      if (!matchesMultilingual(HIGH_RISK, text)) return;

      const submitLike = descendantTags(element).some((tag) => {
        const name = tagNameOf(tag);
        if (name !== "button") return false;
        const typeAttr = getAttribute(tag, "type");
        const type = typeAttr ? stringValueOf(typeAttr)?.toLowerCase() : "submit";
        // Only an absent attribute (HTML default) or an explicit literal counts
        // as submit; a dynamic expression has an unknown type.
        return type === "submit";
      });
      if (!submitLike) return;

      const safeguard = descendantTags(element).some((tag) => {
        const label = accessibleTextOf(tag, element);
        return (
          matchesMultilingual(CONFIRM_LABEL, label) ||
          matchesMultilingual(AGREE_LABEL, label)
        );
      });
      if (safeguard) return;

      findings.push({
        checkId: "error-prevention",
        kind: "warning",
        severity: "serious",
        confidence: "low",
        reason:
          "Component with a high-impact submit action may lack a confirm or review step (WCAG 3.3.4).",
        location: locationOf(source, opening),
        fix: null,
      });
    });

    return findings;
  },
};
