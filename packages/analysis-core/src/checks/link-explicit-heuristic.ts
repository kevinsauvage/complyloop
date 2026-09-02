import { isPropSpreadingHost } from "../jsx-primitives.js";
import {
  VAGUE_LINK_PREFIX,
  VAGUE_LINK_TEXT,
  foldAccents,
} from "../patterns/multilingual.js";
import {
  hasTextContent,
  jsxElementOf,
  locationOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";
import { textContentOf } from "./heuristic-utils.js";

function accessibleLinkText(node: JsxTagNode): string {
  const element = jsxElementOf(node);
  if (!element) return "";
  return textContentOf(element).trim();
}

export const linkExplicitHeuristicCheck: AccessibilityCheck = {
  id: "link-explicit-heuristic",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (tag !== "a" && tag !== "Link") return;
      if (isPropSpreadingHost(node)) return;
      const element = jsxElementOf(node);
      if (!element || !hasTextContent(element)) return;

      const text = accessibleLinkText(node);
      const normalized = foldAccents(text);
      if (
        !VAGUE_LINK_TEXT.test(text) &&
        !VAGUE_LINK_TEXT.test(normalized) &&
        !VAGUE_LINK_PREFIX.test(text) &&
        !VAGUE_LINK_PREFIX.test(normalized)
      ) {
        return;
      }

      findings.push({
        checkId: "link-explicit-heuristic",
        kind: "warning",
        severity: "moderate",
        confidence: "medium",
        reason: `Link text "${text}" may not be explicit out of context (RGAA 6.1).`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
