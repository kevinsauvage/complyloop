import ts from "typescript";
import {
  booleanAttributeValue,
  getAttribute,
  locationOf,
  stringValueOf,
  visitJsxTags,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";
import { AUTH_AUTOCOMPLETE, isAuthField } from "./auth-field.ts";

function blocksPaste(node: Parameters<typeof getAttribute>[0]): boolean {
  const paste = getAttribute(node, "onPaste");
  if (!paste?.initializer || !ts.isJsxExpression(paste.initializer)) {
    return false;
  }
  const expression = paste.initializer.expression;
  if (!expression) return false;
  const text = expression.getText();
  return text.includes("preventDefault");
}

export const accessibleAuthCheck: AccessibilityCheck = {
  id: "accessible-auth",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!isAuthField(node)) return;

      const auto =
        getAttribute(node, "autoComplete") ?? getAttribute(node, "autocomplete");
      if (auto) {
        const value = stringValueOf(auto)?.toLowerCase();
        if (value === "off" || value === "false") {
          findings.push({
            checkId: "accessible-auth",
            kind: "violation",
            severity: "serious",
            confidence: "high",
            reason:
              "Authentication field disables autocomplete, blocking password managers and assistive fill (WCAG 3.3.8).",
            location: locationOf(source, node),
            fix: null,
          });
        }
      }

      if (blocksPaste(node)) {
        findings.push({
          checkId: "accessible-auth",
          kind: "violation",
          severity: "serious",
          confidence: "high",
          reason:
            "Authentication field blocks paste, preventing password managers from filling credentials (WCAG 3.3.8).",
          location: locationOf(source, node),
          fix: null,
        });
      }

      const readOnly = getAttribute(node, "readOnly") ?? getAttribute(node, "readonly");
      if (readOnly && booleanAttributeValue(readOnly) === true) {
        const autoValue = auto ? stringValueOf(auto)?.toLowerCase() : undefined;
        if (autoValue && AUTH_AUTOCOMPLETE.has(autoValue)) {
          findings.push({
            checkId: "accessible-auth",
            kind: "warning",
            severity: "moderate",
            confidence: "low",
            reason:
              "Read-only authentication field may block user-controlled entry; confirm users can paste or use autofill (WCAG 3.3.8).",
            location: locationOf(source, node),
            fix: null,
          });
        }
      }
    });
    return findings;
  },
};
