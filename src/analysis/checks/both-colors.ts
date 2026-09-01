import ts from "typescript";
import { getAttribute, locationOf, visitJsxTags } from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

const COLOR_PROPS = new Set(["color", "backgroundColor", "background"]);

function styleSetsOnlyOneSide(node: Parameters<typeof getAttribute>[0]): boolean {
  const style = getAttribute(node, "style");
  if (!style?.initializer || !ts.isJsxExpression(style.initializer)) {
    return false;
  }
  const expression = style.initializer.expression;
  if (!expression || !ts.isObjectLiteralExpression(expression)) return false;

  let hasColor = false;
  let hasBackground = false;
  for (const prop of expression.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = prop.name.getText();
    if (name === "color") hasColor = true;
    if (COLOR_PROPS.has(name) && name !== "color") hasBackground = true;
  }
  return (hasColor && !hasBackground) || (hasBackground && !hasColor);
}

export const bothColorsCheck: AccessibilityCheck = {
  id: "both-colors",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!styleSetsOnlyOneSide(node)) return;
      findings.push({
        checkId: "both-colors",
        kind: "warning",
        severity: "moderate",
        confidence: "medium",
        reason:
          "Inline style sets color or background without the paired value, which breaks user stylesheets (WCAG 1.4.3 / RGAA 10.5).",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
