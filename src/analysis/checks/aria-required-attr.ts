import {
  explicitRoles,
  isDomHost,
  nativeSatisfiesRole,
  requiredAriaProps,
  type RequiredAriaProp,
} from "../a11y-aria";
import { isPropSpreadingHost } from "../jsx-primitives";
import {
  getAttribute,
  locationOf,
  spanOf,
  tagNameOf,
  visitJsxTags,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

function suggestedValue(prop: RequiredAriaProp): string {
  if (typeof prop.defaultValue === "string") return prop.defaultValue;
  if (typeof prop.defaultValue === "number") return String(prop.defaultValue);
  if (typeof prop.defaultValue === "boolean") return String(prop.defaultValue);
  switch (prop.name) {
    case "aria-checked":
    case "aria-selected":
    case "aria-expanded":
      return "false";
    case "aria-valuenow":
      return "0";
    case "aria-level":
      return "2";
    case "aria-controls":
      return "controlled-id";
    default:
      return "";
  }
}

export const ariaRequiredAttrCheck: AccessibilityCheck = {
  id: "aria-required-attr",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!isDomHost(tagNameOf(node))) return;
      if (isPropSpreadingHost(node)) return;

      for (const role of explicitRoles(node)) {
        if (nativeSatisfiesRole(node, role)) continue;
        const required = requiredAriaProps(role);
        if (required.length === 0) continue;
        const missing = required.filter(
          (prop) => getAttribute(node, prop.name) === undefined,
        );
        if (missing.length === 0) continue;

        const first = missing[0];
        findings.push({
          checkId: "aria-required-attr",
          kind: "violation",
          severity: "serious",
          confidence: "high",
          reason: `role="${role}" is missing required ARIA ${missing.map((prop) => prop.name).join(", ")}.`,
          location: locationOf(source, node),
          fix: first
            ? {
                kind: "insert_attribute",
                attribute: first.name,
                value: suggestedValue(first),
                editable: true,
                span: spanOf(node, source.sourceFile),
              }
            : null,
        });
      }
    });
    return findings;
  },
};
