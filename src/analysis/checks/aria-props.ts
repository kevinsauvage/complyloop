import ts from "typescript";
import { isAriaProperty, isDomHost } from "../a11y-aria";
import { isPropSpreadingHost } from "../jsx-primitives";
import { locationOf, tagNameOf, visitJsxTags } from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

export const ariaPropsCheck: AccessibilityCheck = {
  id: "aria-props",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!isDomHost(tagNameOf(node))) return;
      if (isPropSpreadingHost(node)) return;

      for (const prop of node.attributes.properties) {
        if (!ts.isJsxAttribute(prop)) continue;
        const name = prop.name.getText();
        if (!name.toLowerCase().startsWith("aria-")) continue;
        if (isAriaProperty(name)) continue;

        findings.push({
          checkId: "aria-props",
          kind: "violation",
          severity: "serious",
          confidence: "high",
          reason: `${name} is not a valid ARIA attribute, so the intended name or state never reaches the accessibility tree.`,
          location: locationOf(source, node),
          fix: null,
        });
      }
    });
    return findings;
  },
};
