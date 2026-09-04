import {
  getAttribute,
  locationOf,
  stringValueOf,
  visitJsxTags,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

export const duplicateIdCheck: AccessibilityCheck = {
  id: "duplicate-id",
  run(source) {
    const byId = new Map<string, ReturnType<typeof locationOf>[]>();
    visitJsxTags(source.sourceFile, (node) => {
      const attr = getAttribute(node, "id");
      if (!attr) return;
      const value = stringValueOf(attr);
      if (!value?.trim()) return;
      const list = byId.get(value) ?? [];
      list.push(locationOf(source, node));
      byId.set(value, list);
    });

    const findings: RawFinding[] = [];
    for (const [id, locations] of byId) {
      if (locations.length < 2) continue;
      // Report each duplicate occurrence after the first.
      for (const location of locations.slice(1)) {
        findings.push({
          checkId: "duplicate-id",
          kind: "violation",
          severity: "serious",
          confidence: "high",
          reason: `Duplicate id="${id}" in this file; IDs must be unique for labels, ARIA references, and fragment links.`,
          location,
          fix: null,
        });
      }
    }
    return findings;
  },
};
