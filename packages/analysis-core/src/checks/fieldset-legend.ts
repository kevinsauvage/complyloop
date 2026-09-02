import ts from "typescript";
import { hasAriaName } from "../jsx-primitives.js";
import {
  getAttribute,
  hasTextContent,
  jsxElementOf,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

function roleOf(node: JsxTagNode): string | undefined {
  const attr = getAttribute(node, "role");
  return attr ? stringValueOf(attr) : undefined;
}

function isGroupingHost(node: JsxTagNode): boolean {
  if (tagNameOf(node) === "fieldset") return true;
  const role = roleOf(node);
  return role === "group" || role === "radiogroup";
}

function isInsideGrouping(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxElement(current) && isGroupingHost(current.openingElement)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function groupingHasLegend(node: JsxTagNode): boolean {
  if (hasAriaName(node)) return true;
  const element = jsxElementOf(node);
  if (!element) return false;
  for (const child of element.children) {
    if (!ts.isJsxElement(child)) continue;
    if (tagNameOf(child.openingElement) !== "legend") continue;
    if (hasAriaName(child.openingElement)) return true;
    if (hasTextContent(child)) return true;
  }
  return false;
}

export const fieldsetLegendCheck: AccessibilityCheck = {
  id: "fieldset-legend",
  run(source) {
    const findings: RawFinding[] = [];
    const radiosByName = new Map<string, JsxTagNode[]>();

    visitJsxTags(source.sourceFile, (node) => {
      if (isGroupingHost(node) && !groupingHasLegend(node)) {
        findings.push({
          checkId: "fieldset-legend",
          kind: "violation",
          severity: "serious",
          confidence: "high",
          reason:
            "Field grouping has no legend or accessible name, so users cannot tell what the grouped fields are for.",
          location: locationOf(source, node),
          fix: null,
        });
      }

      if (tagNameOf(node) !== "input") return;
      const typeAttr = getAttribute(node, "type");
      const type = typeAttr ? stringValueOf(typeAttr) : undefined;
      if (type !== "radio") return;
      const nameAttr = getAttribute(node, "name");
      const name = nameAttr ? stringValueOf(nameAttr) : undefined;
      if (!name) return;
      const group = radiosByName.get(name) ?? [];
      group.push(node);
      radiosByName.set(name, group);
    });

    for (const group of radiosByName.values()) {
      if (group.length < 2) continue;
      if (group.every((node) => isInsideGrouping(node))) continue;
      const first = group[0];
      if (!first) continue;
      const nameAttr = getAttribute(first, "name");
      const nameValue = nameAttr ? stringValueOf(nameAttr) : "radio";
      findings.push({
        checkId: "fieldset-legend",
        kind: "violation",
        severity: "serious",
        confidence: "medium",
        reason: `Radio group name="${nameValue}" is not wrapped in a fieldset or labelled group.`,
        location: locationOf(source, first),
        fix: null,
      });
    }

    return findings;
  },
};
