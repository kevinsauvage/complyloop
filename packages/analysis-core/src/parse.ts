import ts from "typescript";

import type { SourceLocation, Span } from "./contract/finding-types.ts";

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

interface JsxIndex {
  tags: JsxTagNode[];
  elements: ts.JsxElement[];
}

/**
 * One pre-order walk per source file, memoized by `SourceFile` identity. All
 * AST checks that call `visitJsxTags`/`visitJsxElements` share this index
 * instead of re-walking the whole tree once per check (previously ~one full
 * `forEachChild` traversal per registered check per file).
 */
const jsxIndexCache = new WeakMap<ts.SourceFile, JsxIndex>();

function jsxIndexFor(sourceFile: ts.SourceFile): JsxIndex {
  const cached = jsxIndexCache.get(sourceFile);
  if (cached) return cached;
  const index: JsxIndex = { tags: [], elements: [] };
  const walk = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      index.tags.push(node);
    } else if (ts.isJsxElement(node)) {
      index.elements.push(node);
    }
    ts.forEachChild(node, walk);
  };
  walk(sourceFile);
  jsxIndexCache.set(sourceFile, index);
  return index;
}

export function visitJsxTags(
  sourceFile: ts.SourceFile,
  visit: (node: JsxTagNode) => void,
): void {
  for (const node of jsxIndexFor(sourceFile).tags) visit(node);
}

/** Full JSX elements (`<Foo>…</Foo>`), not opening/self-closing tags alone. */
export function visitJsxElements(
  sourceFile: ts.SourceFile,
  visit: (element: ts.JsxElement) => void,
): void {
  for (const element of jsxIndexFor(sourceFile).elements) visit(element);
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

/** Returns the literal string value of an attribute (alt="x", alt={"x"}, colSpan={2}), if any. */
export function stringValueOf(attr: ts.JsxAttribute): string | undefined {
  const initializer = attr.initializer;
  if (!initializer) return undefined;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    const expr = initializer.expression;
    if (ts.isStringLiteral(expr)) return expr.text;
    if (ts.isNumericLiteral(expr)) return expr.text;
  }
  return undefined;
}

export function hasAnyAttr(
  node: JsxTagNode,
  names: ReadonlyArray<string>,
): boolean {
  return names.some((name) => getAttribute(node, name) !== undefined);
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

/** Offset of a 1-based line/column in a string (shared by AST + html-validate). */
export function offsetAt(text: string, line: number, column: number): number {
  let offset = 0;
  let currentLine = 1;
  while (currentLine < line && offset < text.length) {
    if (text[offset] === "\n") currentLine += 1;
    offset += 1;
  }
  return Math.min(offset + Math.max(column, 1) - 1, text.length);
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

/**
 * Trimmed source covering every full line a `[start, end)` span touches, so a
 * node whose tag spans multiple lines keeps its attributes (e.g. a `<a` with
 * `target` on later lines). Shared by the AST and jsx-a11y finding producers.
 */
export function snippetForSpan(
  text: string,
  start: number,
  end: number,
): string {
  const lineStart = text.lastIndexOf("\n", Math.max(start - 1, 0)) + 1;
  const nextNewline = text.indexOf("\n", end);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;
  return text.slice(lineStart, lineEnd).trim();
}

export function locationOf(
  source: ParsedSource,
  node: ts.Node,
): SourceLocation {
  const start = node.getStart(source.sourceFile);
  const position = source.sourceFile.getLineAndCharacterOfPosition(start);
  const span = spanOf(node, source.sourceFile);
  return {
    kind: "source",
    filePath: source.filePath,
    line: position.line + 1,
    column: position.character + 1,
    snippet: snippetForSpan(source.text, start, span.end),
    span,
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
      const tag = ts.isJsxElement(child) ? child.openingElement : child;
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

/**
 * True when the element spreads props onto a host tag (typical design-system
 * primitive: `<input {...props} />`). Accessible name/label responsibility
 * belongs at the call site — AST must not fail the primitive definition.
 */
export function isPropSpreadingHost(node: JsxTagNode): boolean {
  return node.attributes.properties.some((prop) =>
    ts.isJsxSpreadAttribute(prop),
  );
}

const ARIA_NAME_PROPERTIES = ["aria-label", "aria-labelledby"] as const;

/**
 * Accessible-name ARIA attributes. `title` is included by default (buttons / links);
 * headings typically ignore it.
 */
export function hasAriaName(
  node: JsxTagNode,
  options: { includeTitle?: boolean } = {},
): boolean {
  const includeTitle = options.includeTitle !== false;
  return (
    hasAnyAttr(node, ARIA_NAME_PROPERTIES) ||
    (includeTitle && getAttribute(node, "title") !== undefined)
  );
}

export function hasAttrOnAncestors(
  node: ts.Node,
  attrName: string,
  options?: { stopAtHtml?: boolean },
): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isJsxOpeningElement(current) ||
      ts.isJsxSelfClosingElement(current)
    ) {
      if (options?.stopAtHtml && tagNameOf(current) === "html") return false;
      if (getAttribute(current, attrName) !== undefined) return true;
    } else if (ts.isJsxElement(current)) {
      if (options?.stopAtHtml && tagNameOf(current.openingElement) === "html") {
        return false;
      }
      if (getAttribute(current.openingElement, attrName) !== undefined)
        return true;
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
