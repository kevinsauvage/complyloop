import ts from "typescript";
import { isPropSpreadingHost } from "../jsx-primitives.js";
import {
  booleanAttributeValue,
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

const FORM_CONTROLS = new Set(["input", "select", "textarea"]);

function isAriaTrue(attr: ReturnType<typeof getAttribute>): boolean {
  const value = booleanAttributeValue(attr);
  // Dynamic expression — treat as potentially invalid so humans can review.
  return value === true || value === null;
}

/** Collects static string literals nested in an expression (ternaries, &&, templates). */
function collectStringLiterals(node: ts.Node, into: Set<string>): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    for (const id of node.text.split(/\s+/)) {
      if (id) into.add(id);
    }
    return;
  }
  if (ts.isTemplateExpression(node)) {
    for (const span of node.templateSpans) {
      collectStringLiterals(span.expression, into);
    }
    return;
  }
  ts.forEachChild(node, (child) => collectStringLiterals(child, into));
}

function describedByIdsFromAttribute(attr: ts.JsxAttribute): Set<string> {
  const ids = new Set<string>();
  const literal = stringValueOf(attr);
  if (literal) {
    for (const id of literal.split(/\s+/)) {
      if (id) ids.add(id);
    }
    return ids;
  }
  const initializer = attr.initializer;
  if (
    initializer &&
    ts.isJsxExpression(initializer) &&
    initializer.expression
  ) {
    collectStringLiterals(initializer.expression, ids);
  }
  return ids;
}

/**
 * Pragmatic heuristics:
 * - aria-invalid without aria-describedby (error not associated)
 * - id containing "error" that nothing references via aria-describedby
 *   (including string literals inside conditional expressions)
 */
export const formErrorAssociationCheck: AccessibilityCheck = {
  id: "form-error-association",
  run(source) {
    const findings: RawFinding[] = [];
    const describedByTargets = new Set<string>();

    visitJsxTags(source.sourceFile, (node) => {
      const describedBy = getAttribute(node, "aria-describedby");
      if (!describedBy) return;
      for (const id of describedByIdsFromAttribute(describedBy)) {
        describedByTargets.add(id);
      }
    });

    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node).toLowerCase();
      if (FORM_CONTROLS.has(tag)) {
        if (isPropSpreadingHost(node)) return;
        const invalid = getAttribute(node, "aria-invalid");
        if (isAriaTrue(invalid) && !getAttribute(node, "aria-describedby")) {
          findings.push({
            checkId: "form-error-association",
            kind: "violation",
            severity: "serious",
            confidence: "medium",
            reason: `<${tag}> is marked aria-invalid but has no aria-describedby linking to an error message.`,
            location: locationOf(source, node),
            fix: null,
          });
        }
      }

      const idAttr = getAttribute(node, "id");
      const idValue = idAttr ? stringValueOf(idAttr) : undefined;
      if (
        idValue &&
        /error/i.test(idValue) &&
        !describedByTargets.has(idValue)
      ) {
        findings.push({
          checkId: "form-error-association",
          kind: "warning",
          severity: "moderate",
          confidence: "low",
          reason: `Element id="${idValue}" looks like an error message but no control references it via aria-describedby.`,
          location: locationOf(source, node),
          fix: null,
        });
      }
    });

    return findings;
  },
};
