import ts from "typescript";
import { classNameTextOf } from "./heuristic-utils.ts";
import {
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  type JsxTagNode,
  visitJsxTags,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

const HEADING_CLASS =
  /\b(text-(2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)|text-h[1-6])\b/;

function fontSizeLooksLikeHeading(node: JsxTagNode): boolean {
  const style = getAttribute(node, "style");
  if (!style || !style.initializer || !ts.isJsxExpression(style.initializer)) {
    return false;
  }
  const expression = style.initializer.expression;
  if (!expression || !ts.isObjectLiteralExpression(expression)) return false;
  return expression.properties.some((prop) => {
    if (!ts.isPropertyAssignment(prop) || prop.name.getText() !== "fontSize") {
      return false;
    }
    const text = prop.initializer.getText().replace(/['"`]/g, "");
    const px = /^(\d+(?:\.\d+)?)px$/.exec(text);
    if (px && Number(px[1]) >= 24) return true;
    const rem = /^(\d+(?:\.\d+)?)rem$/.exec(text);
    return Boolean(rem && Number(rem[1]) >= 1.5);
  });
}

export const pAsHeadingCheck: AccessibilityCheck = {
  id: "p-as-heading",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "p") return;
      const role = getAttribute(node, "role");
      if ((role ? stringValueOf(role) : undefined) === "heading") return;
      if (
        !HEADING_CLASS.test(classNameTextOf(node)) &&
        !fontSizeLooksLikeHeading(node)
      ) {
        return;
      }

      findings.push({
        checkId: "p-as-heading",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "<p> is styled like a heading. Use an h1–h6 (or role=\"heading\" with aria-level) so the document outline matches the visual hierarchy.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
