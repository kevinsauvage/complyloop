import { isPropSpreadingHost } from "../jsx-primitives";
import {
  hasTextContent,
  jsxElementOf,
  locationOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";
import { textContentOf } from "./heuristic-utils";

const VAGUE_LINK_TEXT =
  /^(click here|read more|here|more|suite|lire la suite|ici|en savoir plus)$/i;

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
      if (!VAGUE_LINK_TEXT.test(text)) return;

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
