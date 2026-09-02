import { explicitRoles, isPresentationRole } from "../a11y-aria.js";
import { implicitRoles } from "../a11y-model.js";
import { isPropSpreadingHost } from "../jsx-primitives.js";
import { locationOf, tagNameOf, visitJsxTags } from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

export const redundantRoleCheck: AccessibilityCheck = {
  id: "redundant-role",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (isPropSpreadingHost(node)) return;
      if (isPresentationRole(node)) return;
      const explicit = explicitRoles(node);
      if (explicit.length === 0) return;
      const implicit = new Set(implicitRoles(node));
      const redundant = explicit.find((role) => implicit.has(role));
      if (!redundant) return;

      findings.push({
        checkId: "redundant-role",
        kind: "violation",
        severity: "moderate",
        confidence: "high",
        reason: `<${tagNameOf(node)}> already has an implicit ${redundant} role; role="${redundant}" is redundant and can confuse assistive technologies.`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
