import ts from "typescript";
import { locationOf, spanOf, visitJsxTags } from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

function positiveTabIndexValue(attr: ts.JsxAttribute): number | null {
  const initializer = attr.initializer;
  if (!initializer) return null;
  let text: string | undefined;
  if (ts.isStringLiteral(initializer)) {
    text = initializer.text;
  } else if (
    ts.isJsxExpression(initializer) &&
    initializer.expression &&
    ts.isNumericLiteral(initializer.expression)
  ) {
    text = initializer.expression.text;
  }
  if (text === undefined) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export const positiveTabindexCheck: AccessibilityCheck = {
  id: "positive-tabindex",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      for (const prop of node.attributes.properties) {
        if (!ts.isJsxAttribute(prop)) continue;
        const name = prop.name.getText();
        if (name !== "tabIndex" && name !== "tabindex") continue;

        const value = positiveTabIndexValue(prop);
        if (value === null || !prop.initializer) continue;

        findings.push({
          checkId: "positive-tabindex",
          kind: "violation",
          severity: "moderate",
          confidence: "high",
          reason: `tabIndex={${value}} forces a custom tab order, which breaks keyboard navigation for the rest of the page.`,
          location: locationOf(source, node),
          fix: {
            kind: "replace_attribute_value",
            attribute: name,
            replacementText: "{0}",
            span: spanOf(prop.initializer, source.sourceFile),
          },
        });
      }
    });
    return findings;
  },
};
