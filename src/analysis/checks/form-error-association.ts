import { isPropSpreadingHost } from "../jsx-primitives";
import {
  booleanAttributeValue,
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

const FORM_CONTROLS = new Set(["input", "select", "textarea"]);

function isAriaTrue(attr: ReturnType<typeof getAttribute>): boolean {
  const value = booleanAttributeValue(attr);
  // Dynamic expression — treat as potentially invalid so humans can review.
  return value === true || value === null;
}

/**
 * Pragmatic heuristics:
 * - aria-invalid without aria-describedby (error not associated)
 * - id containing "error" that nothing references via aria-describedby
 */
export const formErrorAssociationCheck: AccessibilityCheck = {
  id: "form-error-association",
  run(source) {
    const findings: RawFinding[] = [];
    const describedByTargets = new Set<string>();

    visitJsxTags(source.sourceFile, (node) => {
      const describedBy = getAttribute(node, "aria-describedby");
      const value = describedBy ? stringValueOf(describedBy) : undefined;
      if (value) {
        for (const id of value.split(/\s+/)) {
          if (id) describedByTargets.add(id);
        }
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
