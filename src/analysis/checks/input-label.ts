import ts from "typescript";
import { isPropSpreadingHost } from "../jsx-primitives";
import {
  getAttribute,
  humanizeFileName,
  locationOf,
  spanOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

const UNLABELED_EXEMPT_TYPES = new Set([
  "hidden",
  "submit",
  "reset",
  "button",
  "image",
]);

function collectLabelTargets(sourceFile: ts.SourceFile): Set<string> {
  const targets = new Set<string>();
  visitJsxTags(sourceFile, (node) => {
    if (tagNameOf(node) !== "label") return;
    const htmlFor = getAttribute(node, "htmlFor");
    const value = htmlFor ? stringValueOf(htmlFor) : undefined;
    if (value) targets.add(value);
  });
  return targets;
}

function defaultLabelFor(node: JsxTagNode): string {
  const nameAttr = getAttribute(node, "name") ?? getAttribute(node, "placeholder");
  const value = nameAttr ? stringValueOf(nameAttr) : undefined;
  const humanized = value ? humanizeFileName(value) : "";
  return humanized.length > 0 ? humanized : "Describe this field";
}

export const inputLabelCheck: AccessibilityCheck = {
  id: "input-label",
  run(source) {
    const labelTargets = collectLabelTargets(source.sourceFile);
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "input") return;
      // Design-system primitives spread props; labels live at call sites.
      if (isPropSpreadingHost(node)) return;

      const type = getAttribute(node, "type");
      const typeValue = type ? stringValueOf(type) : undefined;
      if (typeValue && UNLABELED_EXEMPT_TYPES.has(typeValue)) return;

      if (
        getAttribute(node, "aria-label") !== undefined ||
        getAttribute(node, "aria-labelledby") !== undefined
      ) {
        return;
      }

      const id = getAttribute(node, "id");
      const idValue = id ? stringValueOf(id) : undefined;
      if (idValue && labelTargets.has(idValue)) return;

      findings.push({
        checkId: "input-label",
        kind: "violation",
        severity: "serious",
        // The label association is only checked within the same file.
        confidence: "medium",
        reason:
          "<input> has no associated <label>, aria-label, or aria-labelledby, so users cannot tell what to enter.",
        location: locationOf(source, node),
        fix: {
          kind: "insert_attribute",
          attribute: "aria-label",
          value: defaultLabelFor(node),
          editable: true,
          span: spanOf(node, source.sourceFile),
        },
      });
    });
    return findings;
  },
};
