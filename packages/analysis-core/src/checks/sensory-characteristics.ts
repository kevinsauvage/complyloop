import { locationOf } from "../parse.ts";
import ts from "typescript";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

const SENSORY_RE =
  /\b(red|green|blue|yellow|orange|purple|black|white|gray|grey|pink)\b[^<.]{0,24}\b(button|link|icon|tab|field|checkbox|toggle)\b|\b(left|right|above|below|top|bottom)\b[^<.]{0,24}\b(button|link|icon|tab|field|column|sidebar)\b/i;

export const sensoryCharacteristicsCheck: AccessibilityCheck = {
  id: "sensory-characteristics",
  run(source) {
    const findings: RawFinding[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isJsxText(node)) {
        const text = node.text.trim();
        if (text && SENSORY_RE.test(text)) {
          findings.push({
            checkId: "sensory-characteristics",
            kind: "warning",
            severity: "minor",
            confidence: "low",
            reason: "Instruction may rely on a sensory characteristic (color, position, or shape) rather than text alone. Ensure it does not depend solely on it (WCAG 1.3.3).",
            location: locationOf(source, node),
            fix: null,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source.sourceFile);
    return findings;
  },
};
