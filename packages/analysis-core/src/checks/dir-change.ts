import ts from "typescript";
import {
  getAttribute,
  locationOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

const RTL_CHAR = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F]/;
const LTR_CHAR = /[A-Za-z]/;

function textHasRtl(text: string): boolean {
  return RTL_CHAR.test(text);
}

function textHasLtr(text: string): boolean {
  return LTR_CHAR.test(text);
}

function hasDirOnAncestors(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxOpeningElement(current) || ts.isJsxSelfClosingElement(current)) {
      if (getAttribute(current, "dir") !== undefined) return true;
    } else if (ts.isJsxElement(current)) {
      if (getAttribute(current.openingElement, "dir") !== undefined) return true;
    }
    current = current.parent;
  }
  return false;
}

function collectJsxText(sourceFile: ts.SourceFile): Array<{
  node: ts.JsxText;
  hasRtl: boolean;
  hasLtr: boolean;
}> {
  const texts: Array<{ node: ts.JsxText; hasRtl: boolean; hasLtr: boolean }> =
    [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const trimmed = node.text.trim();
      if (trimmed.length > 0) {
        texts.push({
          node,
          hasRtl: textHasRtl(trimmed),
          hasLtr: textHasLtr(trimmed),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return texts;
}

export const dirChangeCheck: AccessibilityCheck = {
  id: "dir-change",
  run(source) {
    const texts = collectJsxText(source.sourceFile);
    const fileHasRtl = texts.some((entry) => entry.hasRtl);
    const fileHasLtr = texts.some((entry) => entry.hasLtr);
    if (!fileHasRtl || !fileHasLtr) return [];

    const findings: RawFinding[] = [];
    for (const entry of texts) {
      if (!entry.hasRtl || hasDirOnAncestors(entry.node)) continue;
      findings.push({
        checkId: "dir-change",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "Right-to-left text appears in a mixed-direction file without a dir attribute on the containing element (WCAG 1.3.2).",
        location: locationOf(source, entry.node),
        fix: null,
      });
    }

    visitJsxTags(source.sourceFile, (node: JsxTagNode) => {
      const dir = getAttribute(node, "dir");
      if (!dir) return;
      const value = dir.initializer?.getText().replace(/['"]/g, "") ?? "";
      if (value !== "rtl" && value !== "ltr") return;
      const parent = node.parent;
      if (!parent || !ts.isJsxElement(parent)) return;
      const siblings = parent.children.filter(ts.isJsxText);
      const siblingMix =
        siblings.some((s) => textHasRtl(s.text)) &&
        siblings.some((s) => textHasLtr(s.text));
      if (!siblingMix) return;
      if (hasDirOnAncestors(node)) return;
      findings.push({
        checkId: "dir-change",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason: `<${tagNameOf(node)}> sets dir="${value}" but mixed-direction siblings lack an explicit text direction (WCAG 1.3.2).`,
        location: locationOf(source, node),
        fix: null,
      });
    });

    return findings;
  },
};
