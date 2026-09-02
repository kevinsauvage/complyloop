import ts from "typescript";
import type { SourceLocation, Span } from "./contract/finding-types";

export interface ParsedSource {
  /** Path relative to the scanned project root. */
  filePath: string;
  text: string;
  sourceFile: ts.SourceFile;
}

export type JsxTagNode = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

export function parseSource(filePath: string, text: string): ParsedSource {
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );
  return { filePath, text, sourceFile };
}

export function visitJsxTags(
  sourceFile: ts.SourceFile,
  visit: (node: JsxTagNode) => void,
): void {
  const walk = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      visit(node);
    }
    ts.forEachChild(node, walk);
  };
  walk(sourceFile);
}

export function tagNameOf(node: JsxTagNode): string {
  return node.tagName.getText();
}

/** The wrapping `<Foo>…</Foo>` element for an opening tag, if any. */
export function jsxElementOf(node: JsxTagNode): ts.JsxElement | undefined {
  if (ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)) {
    return node.parent;
  }
  return undefined;
}

export function getAttribute(
  node: JsxTagNode,
  name: string,
): ts.JsxAttribute | undefined {
  for (const prop of node.attributes.properties) {
    if (ts.isJsxAttribute(prop) && prop.name.getText() === name) {
      return prop;
    }
  }
  return undefined;
}

/** Returns the literal string value of an attribute (alt="x" or alt={"x"}), if any. */
export function stringValueOf(attr: ts.JsxAttribute): string | undefined {
  const initializer = attr.initializer;
  if (!initializer) return undefined;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (
    ts.isJsxExpression(initializer) &&
    initializer.expression &&
    ts.isStringLiteral(initializer.expression)
  ) {
    return initializer.expression.text;
  }
  return undefined;
}

/**
 * Interprets a JSX ARIA/boolean attribute as true/false when statically known.
 * Boolean shorthand (`aria-hidden`) and `"true"` / `{true}` → true;
 * `"false"` / `{false}` → false; dynamic expressions → null (unknown).
 */
export function booleanAttributeValue(
  attr: ts.JsxAttribute | undefined,
): boolean | null {
  if (!attr) return false;
  if (!attr.initializer) return true;
  const lit = stringValueOf(attr);
  if (lit !== undefined) return lit !== "false";
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    const kind = attr.initializer.expression.kind;
    if (kind === ts.SyntaxKind.TrueKeyword) return true;
    if (kind === ts.SyntaxKind.FalseKeyword) return false;
  }
  return null;
}

export function spanOf(node: ts.Node, sourceFile: ts.SourceFile): Span {
  return { start: node.getStart(sourceFile), end: node.getEnd() };
}

/** Span of a JSX attribute including leading whitespace (for safe removal). */
export function attributeRemovalSpan(
  attr: ts.JsxAttribute,
  sourceFile: ts.SourceFile,
  text: string,
): Span {
  const start = attr.getStart(sourceFile);
  const end = attr.getEnd();
  let adjustedStart = start;
  while (adjustedStart > 0 && /[ \t\n\r]/.test(text[adjustedStart - 1]!)) {
    adjustedStart -= 1;
  }
  return { start: adjustedStart, end };
}

export function locationOf(source: ParsedSource, node: ts.Node): SourceLocation {
  const start = node.getStart(source.sourceFile);
  const position = source.sourceFile.getLineAndCharacterOfPosition(start);
  const lineText = source.text.split("\n")[position.line] ?? "";
  return {
    kind: "source",
    filePath: source.filePath,
    line: position.line + 1,
    column: position.character + 1,
    snippet: lineText.trim(),
    span: spanOf(node, source.sourceFile),
  };
}

/**
 * True when a JSX element exposes an accessible name through its content:
 * non-empty text, an expression (assumed to render text), or an image child
 * with a non-empty alt. Aria attributes are checked separately by callers.
 */
export function hasTextContent(element: ts.JsxElement): boolean {
  for (const child of element.children) {
    if (ts.isJsxText(child) && child.text.trim().length > 0) return true;
    if (ts.isJsxExpression(child) && child.expression) return true;
    if (ts.isJsxSelfClosingElement(child) || ts.isJsxElement(child)) {
      const tag = ts.isJsxElement(child)
        ? child.openingElement
        : child;
      const name = tag.tagName.getText();
      if (name === "img" || name === "Image") {
        const alt = getAttribute(tag, "alt");
        const altText = alt ? stringValueOf(alt) : undefined;
        if (altText !== undefined && altText.trim().length > 0) return true;
      }
      if (ts.isJsxElement(child) && hasTextContent(child)) return true;
    }
  }
  return false;
}

/** Turns "hero-banner.png" into "Hero banner". */
export function humanizeFileName(value: string): string {
  const base = value.split("/").pop() ?? value;
  const withoutExtension = base.replace(/\.[a-z0-9]+$/i, "");
  const words = withoutExtension.replace(/[-_]+/g, " ").trim();
  if (words.length === 0) return "";
  return words.charAt(0).toUpperCase() + words.slice(1);
}
