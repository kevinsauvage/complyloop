import ts from "typescript";
import { isPresentationRole } from "../a11y-aria.js";
import { isPropSpreadingHost } from "../jsx-primitives.js";
import {
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

function referencedHeaderIds(sourceFile: Parameters<typeof visitJsxTags>[0]): Set<string> {
  const ids = new Set<string>();
  visitJsxTags(sourceFile, (node) => {
    const attr = getAttribute(node, "headers");
    const value = attr ? stringValueOf(attr) : undefined;
    if (!value) return;
    for (const id of value.trim().split(/\s+/)) {
      if (id) ids.add(id);
    }
  });
  return ids;
}

function enclosingTable(node: ts.Node): JsxTagNode | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxElement(current) && tagNameOf(current.openingElement) === "table") {
      return current.openingElement;
    }
    current = current.parent;
  }
  return undefined;
}

export const thScopeCheck: AccessibilityCheck = {
  id: "th-scope",
  run(source) {
    const findings: RawFinding[] = [];
    const headerIds = referencedHeaderIds(source.sourceFile);

    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "th") return;
      if (isPropSpreadingHost(node)) return;
      const table = enclosingTable(node);
      if (table && isPresentationRole(table)) return;
      if (getAttribute(node, "scope")) return;

      const idAttr = getAttribute(node, "id");
      const id = idAttr ? stringValueOf(idAttr) : undefined;
      if (id && headerIds.has(id)) return;

      findings.push({
        checkId: "th-scope",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          "<th> has no scope and is not referenced via headers, so assistive technologies cannot tell whether it labels a row or a column.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
