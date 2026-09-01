import ts from "typescript";
import { locationOf } from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

function isEmptyDepsArray(node: ts.Expression | undefined): boolean {
  return (
    node !== undefined &&
    ts.isArrayLiteralExpression(node) &&
    node.elements.length === 0
  );
}

function bodyContainsWindowOpen(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(child) &&
      child.expression.getText() === "window" &&
      child.name.getText() === "open"
    ) {
      found = true;
      return;
    }
    if (ts.isIdentifier(child) && child.getText() === "window.open") {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function isMountUseEffect(call: ts.CallExpression): boolean {
  if (!ts.isIdentifier(call.expression) || call.expression.text !== "useEffect") {
    return false;
  }
  if (call.arguments.length < 2) return false;
  const effectFn = call.arguments[0];
  if (!effectFn || !bodyContainsWindowOpen(effectFn)) return false;
  return isEmptyDepsArray(call.arguments[1]);
}

export const newWindowOnloadCheck: AccessibilityCheck = {
  id: "new-window-onload",
  run(source) {
    const findings: RawFinding[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        if (isMountUseEffect(node)) {
          findings.push({
            checkId: "new-window-onload",
            kind: "violation",
            severity: "serious",
            confidence: "medium",
            reason:
              "useEffect on mount calls window.open, which opens an unsolicited new window without user action (RGAA 13.2).",
            location: locationOf(source, node),
            fix: null,
          });
        } else if (
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.expression.getText() === "window" &&
          node.expression.name.getText() === "open" &&
          !ts.isCallExpression(node.parent)
        ) {
          let inHandler = false;
          let current: ts.Node | undefined = node.parent;
          while (current) {
            if (
              ts.isArrowFunction(current) ||
              ts.isFunctionExpression(current) ||
              ts.isMethodDeclaration(current)
            ) {
              inHandler = true;
              break;
            }
            current = current.parent;
          }
          if (!inHandler) {
            findings.push({
              checkId: "new-window-onload",
              kind: "violation",
              severity: "serious",
              confidence: "medium",
              reason:
                "window.open runs outside an explicit user handler and may open an unsolicited window (RGAA 13.2).",
              location: locationOf(source, node),
              fix: null,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source.sourceFile);
    return findings;
  },
};
