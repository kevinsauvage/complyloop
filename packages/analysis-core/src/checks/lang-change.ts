import ts from "typescript";
import {
  getAttribute,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.js";
import type { AccessibilityCheck, RawFinding } from "../types.js";

const LATIN_EXTENDED = /[À-ÿ]/;
const CYRILLIC = /[\u0400-\u04FF]/;
const ARABIC = /[\u0600-\u06FF]/;
const CJK = /[\u3040-\u30FF\u4E00-\u9FFF]/;

function pageLang(sourceFile: ts.SourceFile): string | undefined {
  let lang: string | undefined;
  visitJsxTags(sourceFile, (node) => {
    if (lang !== undefined) return;
    if (tagNameOf(node) !== "html") return;
    const attribute = getAttribute(node, "lang");
    if (!attribute) return;
    lang = stringValueOf(attribute)?.toLowerCase();
  });
  return lang;
}

function hasLangOnAncestors(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxOpeningElement(current) || ts.isJsxSelfClosingElement(current)) {
      if (tagNameOf(current) === "html") return false;
      if (getAttribute(current, "lang") !== undefined) return true;
    } else if (ts.isJsxElement(current)) {
      if (tagNameOf(current.openingElement) === "html") return false;
      if (getAttribute(current.openingElement, "lang") !== undefined) return true;
    }
    current = current.parent;
  }
  return false;
}

function collectJsxText(sourceFile: ts.SourceFile): Array<{
  node: ts.JsxText;
  text: string;
}> {
  const texts: Array<{ node: ts.JsxText; text: string }> = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const trimmed = node.text.trim();
      if (trimmed.length > 3) texts.push({ node, text: trimmed });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return texts;
}

function needsLangForScript(text: string, pageDefault: string | undefined): boolean {
  const defaultLang = pageDefault?.split("-")[0] ?? "en";
  if (defaultLang === "fr" || defaultLang === "en" || defaultLang === "de") {
    if (CYRILLIC.test(text) || ARABIC.test(text) || CJK.test(text)) return true;
  }
  if ((defaultLang === "en" || defaultLang === undefined) && LATIN_EXTENDED.test(text)) {
    return true;
  }
  if (defaultLang === "en" && CYRILLIC.test(text)) return true;
  return false;
}

export const langChangeCheck: AccessibilityCheck = {
  id: "lang-change",
  run(source) {
    const defaultLang = pageLang(source.sourceFile);
    const findings: RawFinding[] = [];

    for (const entry of collectJsxText(source.sourceFile)) {
      if (!needsLangForScript(entry.text, defaultLang)) continue;
      if (hasLangOnAncestors(entry.node)) continue;
      findings.push({
        checkId: "lang-change",
        kind: "warning",
        severity: "moderate",
        confidence: "medium",
        reason:
          "Text appears to use a different language or script than the page default but has no lang attribute on a containing element (WCAG 3.1.2 / RGAA 8.7).",
        location: locationOf(source, entry.node),
        fix: null,
      });
    }

    return findings;
  },
};
