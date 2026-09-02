import {
  explicitRoles,
  isConcreteAriaRole,
  isDomHost,
} from "../a11y-aria.js";
import { isPropSpreadingHost } from "../jsx-primitives.js";
import { locationOf, tagNameOf, visitJsxTags } from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

export const ariaRoleCheck: AccessibilityCheck = {
  id: "aria-role",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!isDomHost(tagNameOf(node))) return;
      if (isPropSpreadingHost(node)) return;
      const roleValues = explicitRoles(node);
      if (roleValues.length === 0) return;
      if (roleValues.every((role) => isConcreteAriaRole(role))) return;

      const invalid = roleValues.filter((role) => !isConcreteAriaRole(role));
      findings.push({
        checkId: "aria-role",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason: `role="${roleValues.join(" ")}" is not a concrete ARIA role (${invalid.join(", ")}). Assistive technologies ignore abstract or invented roles.`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
