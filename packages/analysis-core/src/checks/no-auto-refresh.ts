import ts from "typescript";
import { locationOf } from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

const REFRESH_KEYWORDS = [
  "location",
  "router.push",
  "router.replace",
  "navigate(",
  "window.location",
  "href =",
  "history.push",
  "history.replace",
];

function isTimerCallee(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) {
    return expression.text === "setTimeout" || expression.text === "setInterval";
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const name = expression.name.text;
    return name === "setTimeout" || name === "setInterval";
  }
  return false;
}

function callbackMayRefresh(callback: ts.Expression | undefined): boolean {
  if (!callback) return false;
  const text = callback.getText();
  return REFRESH_KEYWORDS.some((keyword) => text.includes(keyword));
}

export const noAutoRefreshCheck: AccessibilityCheck = {
  id: "no-auto-refresh",
  run(source) {
    const findings: RawFinding[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && isTimerCallee(node.expression)) {
        const callback = node.arguments[0];
        if (callbackMayRefresh(callback)) {
          findings.push({
            checkId: "no-auto-refresh",
            kind: "warning",
            severity: "moderate",
            confidence: "medium",
            reason:
              "A timer may refresh or navigate the page automatically; users may not control the time limit (RGAA 13.1).",
            location: locationOf(source, node),
            fix: null,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source.sourceFile);
    return findings;
  },
};
