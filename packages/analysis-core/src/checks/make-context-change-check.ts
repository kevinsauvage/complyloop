import { isDecorativeOrHidden, isDomHost } from "../a11y-aria.ts";
import { isPropSpreadingHost } from "../jsx-primitives.ts";
import {
  hasAnyAttr,
  locationOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";
import { handlerTriggersContextChange } from "./heuristic-utils.ts";

export function makeContextChangeCheck(options: {
  id: "focus-context-change" | "input-context-change";
  handlers: readonly string[];
  reasonForTag: (tagName: string) => string;
}): AccessibilityCheck {
  return {
    id: options.id,
    run(source) {
      const findings: RawFinding[] = [];
      visitJsxTags(source.sourceFile, (node) => {
        if (!isDomHost(tagNameOf(node))) return;
        if (isPropSpreadingHost(node)) return;
        if (isDecorativeOrHidden(node)) return;
        if (!hasAnyAttr(node, options.handlers)) return;
        if (!handlerTriggersContextChange(node, options.handlers)) return;
        findings.push({
          checkId: options.id,
          kind: "warning",
          severity: "moderate",
          confidence: "low",
          reason: options.reasonForTag(tagNameOf(node)),
          location: locationOf(source, node),
          fix: null,
        });
      });
      return findings;
    },
  };
}
