import ts from "typescript";
import { getAttribute, tagNameOf } from "../parse.ts";

export function hasAttrOnAncestors(
  node: ts.Node,
  attrName: string,
  options?: { stopAtHtml?: boolean },
): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxOpeningElement(current) || ts.isJsxSelfClosingElement(current)) {
      if (options?.stopAtHtml && tagNameOf(current) === "html") return false;
      if (getAttribute(current, attrName) !== undefined) return true;
    } else if (ts.isJsxElement(current)) {
      if (options?.stopAtHtml && tagNameOf(current.openingElement) === "html") {
        return false;
      }
      if (getAttribute(current.openingElement, attrName) !== undefined) return true;
    }
    current = current.parent;
  }
  return false;
}

export function collectJsxTexts(
  sourceFile: ts.SourceFile,
  options?: { minLength?: number },
): Array<{ node: ts.JsxText; text: string }> {
  const minLength = options?.minLength ?? 1;
  const texts: Array<{ node: ts.JsxText; text: string }> = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const trimmed = node.text.trim();
      if (trimmed.length >= minLength) texts.push({ node, text: trimmed });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return texts;
}
