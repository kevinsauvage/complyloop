import ts from "typescript";
import { hasAriaName } from "../jsx-primitives.ts";
import { textContentOf } from "./heuristic-utils.ts";
import {
  getAttribute,
  locationOf,
  tagNameOf,
  visitJsxElements,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

const ASCII_ART_LINE =
  /^[\s|/\\_\-=+*#@<>[\]().,'"`~:;{}[\]\\]{5,}$/;
const EMOTICON_ONLY = /^(\s*(:-?\)|:-?\(|;-?\)|:-?D|:\||:-?P|<3|xD)\s*)+$/i;

function isAsciiArtBlock(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return false;
  const artLines = lines.filter((line) => ASCII_ART_LINE.test(line));
  return artLines.length >= 2;
}

function hasAccessibleAlternative(node: JsxTagNode): boolean {
  if (hasAriaName(node)) return true;
  return getAttribute(node, "aria-describedby") !== undefined;
}

function jsxHostOf(node: ts.Node): JsxTagNode | undefined {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isJsxOpeningElement(current) || ts.isJsxSelfClosingElement(current)) {
      return current;
    }
    if (ts.isJsxElement(current)) return current.openingElement;
    current = current.parent;
  }
  return undefined;
}

export const crypticContentAltCheck: AccessibilityCheck = {
  id: "cryptic-content-alt",
  run(source) {
    const findings: RawFinding[] = [];

    visitJsxElements(source.sourceFile, (element) => {
      if (tagNameOf(element.openingElement) !== "pre") return;
      const text = textContentOf(element).trim();
      if (!isAsciiArtBlock(text)) return;
      if (hasAccessibleAlternative(element.openingElement)) return;

      findings.push({
        checkId: "cryptic-content-alt",
        kind: "violation",
        severity: "moderate",
        confidence: "medium",
        reason:
          "ASCII art in <pre> has no accessible alternative (aria-label, aria-labelledby, or aria-describedby) (WCAG 1.1.1 / RGAA 13.5).",
        location: locationOf(source, element.openingElement),
        fix: null,
      });
    });

    const visitText = (node: ts.Node): void => {
      if (!ts.isJsxText(node)) {
        ts.forEachChild(node, visitText);
        return;
      }
      const trimmed = node.text.trim();
      if (trimmed.length === 0 || !EMOTICON_ONLY.test(trimmed)) {
        ts.forEachChild(node, visitText);
        return;
      }
      const host = jsxHostOf(node);
      if (!host || hasAccessibleAlternative(host)) {
        ts.forEachChild(node, visitText);
        return;
      }
      findings.push({
        checkId: "cryptic-content-alt",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "Emoticon-only text may need a text alternative for screen reader users (WCAG 1.1.1 / RGAA 13.5).",
        location: locationOf(source, node),
        fix: null,
      });
      ts.forEachChild(node, visitText);
    };
    visitText(source.sourceFile);

    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (tag !== "span" && tag !== "p") return;
      const element = ts.isJsxOpeningElement(node) ? node.parent : null;
      if (!element || !ts.isJsxElement(element)) return;
      const text = textContentOf(element).trim();
      if (!EMOTICON_ONLY.test(text) || hasAccessibleAlternative(node)) return;
      findings.push({
        checkId: "cryptic-content-alt",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "Emoticon-only content may need an accessible name or description (WCAG 1.1.1 / RGAA 13.5).",
        location: locationOf(source, node),
        fix: null,
      });
    });

    return findings;
  },
};
