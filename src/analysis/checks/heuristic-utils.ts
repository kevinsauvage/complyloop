import ts from "typescript";
import {
  getAttribute,
  jsxElementOf,
  stringValueOf,
  tagNameOf,
  type JsxTagNode,
} from "../parse";

export function hasAnyAttr(node: JsxTagNode, names: string[]): boolean {
  return names.some((name) => getAttribute(node, name) !== undefined);
}

const CONTEXT_CHANGE_KEYWORDS = [
  "push(",
  "replace(",
  "navigate(",
  "window.location",
  ".submit(",
  "router.",
  "href =",
];

export function handlerTriggersContextChange(
  node: JsxTagNode,
  handlerNames: string[],
): boolean {
  for (const name of handlerNames) {
    const attr = getAttribute(node, name);
    if (!attr || !attr.initializer || !ts.isJsxExpression(attr.initializer)) {
      continue;
    }
    const expression = attr.initializer.expression;
    if (!expression) continue;
    const text = expression.getText();
    if (CONTEXT_CHANGE_KEYWORDS.some((keyword) => text.includes(keyword))) {
      return true;
    }
  }
  return false;
}

const MOTION_EVENTS = new Set([
  "deviceorientation",
  "deviceorientationabsolute",
  "devicemotion",
]);

export function walkMotionActuationCalls(
  sourceFile: ts.SourceFile,
  emit: (node: ts.CallExpression) => void,
): void {
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.getText() === "addEventListener" &&
      node.arguments.length > 0
    ) {
      const first = node.arguments[0];
      if (ts.isStringLiteral(first) && MOTION_EVENTS.has(first.text)) {
        emit(node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

const MEDIA_TRACK_TAGS = new Set(["track"]);

export function hasChildTrackKind(
  node: JsxTagNode,
  kinds: ReadonlySet<string>,
): boolean {
  const element = jsxElementOf(node);
  if (!element) return false;
  for (const child of element.children) {
    const tag: JsxTagNode | undefined = ts.isJsxSelfClosingElement(child)
      ? child
      : ts.isJsxElement(child)
        ? child.openingElement
        : undefined;
    if (!tag || !MEDIA_TRACK_TAGS.has(tagNameOf(tag))) continue;
    const kind = getAttribute(tag, "kind");
    const value = kind ? stringValueOf(kind)?.toLowerCase() : undefined;
    if (value && kinds.has(value)) return true;
  }
  return false;
}

const SPACING_STYLE_PROPS = new Set([
  "letterSpacing",
  "lineHeight",
  "wordSpacing",
  "paragraphSpacing",
]);

/** True when an inline style locks text spacing with `!important`. */
export function styleLocksTextSpacing(node: JsxTagNode): boolean {
  const style = getAttribute(node, "style");
  if (!style || !style.initializer || !ts.isJsxExpression(style.initializer)) {
    return false;
  }
  const expression = style.initializer.expression;
  if (!expression || !ts.isObjectLiteralExpression(expression)) return false;
  return expression.properties.some((prop) => {
    if (!ts.isPropertyAssignment(prop)) return false;
    if (!SPACING_STYLE_PROPS.has(prop.name.getText())) return false;
    const text = prop.initializer.getText();
    return /!important/i.test(text);
  });
}

export function classNameTextOf(node: JsxTagNode): string {
  const attr =
    getAttribute(node, "className") ?? getAttribute(node, "class");
  if (!attr) return "";
  const literal = stringValueOf(attr);
  if (literal !== undefined) return literal;
  return attr.initializer?.getText() ?? "";
}

export function styleHasBackgroundImage(node: JsxTagNode): boolean {
  const style = getAttribute(node, "style");
  if (!style || !style.initializer || !ts.isJsxExpression(style.initializer)) {
    return false;
  }
  const expression = style.initializer.expression;
  if (!expression || !ts.isObjectLiteralExpression(expression)) return false;
  return expression.properties.some(
    (prop) =>
      ts.isPropertyAssignment(prop) && prop.name.getText() === "backgroundImage",
  );
}

export function visitJsxElements(
  sourceFile: ts.SourceFile,
  visit: (element: ts.JsxElement) => void,
): void {
  const walk = (node: ts.Node): void => {
    if (ts.isJsxElement(node)) visit(node);
    ts.forEachChild(node, walk);
  };
  walk(sourceFile);
}

export function textContentOf(element: ts.JsxElement): string {
  let text = "";
  const walk = (node: ts.Node): void => {
    if (ts.isJsxText(node)) text += node.text + " ";
    else ts.forEachChild(node, walk);
  };
  walk(element);
  return text;
}

/** Opening / self-closing JSX tags nested under an element (not the host). */
export function descendantTags(element: ts.JsxElement): JsxTagNode[] {
  const tags: JsxTagNode[] = [];
  const walk = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      tags.push(node);
    }
    ts.forEachChild(node, walk);
  };
  for (const child of element.children) walk(child);
  return tags;
}

/** True when a data table likely needs a structural summary (RGAA 5.1). */
export function isComplexDataTable(
  tableNode: JsxTagNode,
  options?: { spanExceedsOne?: (node: JsxTagNode) => boolean },
): boolean {
  const element = jsxElementOf(tableNode);
  if (!element) return false;

  const tags = descendantTags(element);
  const spanExceedsOne =
    options?.spanExceedsOne ??
    ((node: JsxTagNode) => {
      for (const name of ["colSpan", "colspan", "rowSpan", "rowspan"] as const) {
        const attr = getAttribute(node, name);
        if (!attr) continue;
        const value = stringValueOf(attr);
        if (value !== undefined) {
          const parsed = Number.parseInt(value, 10);
          if (Number.isFinite(parsed) && parsed > 1) return true;
        }
      }
      return false;
    });

  let headerRows = 0;
  let dataRows = 0;
  let dataCols = 0;
  let hasHeadersAttr = false;
  let theadCount = 0;

  for (const tag of tags) {
    const name = tagNameOf(tag);
    if (name === "thead") theadCount += 1;
    if (name === "th") headerRows += 1;
    if (name === "td") dataRows += 1;
    if (getAttribute(tag, "headers")) hasHeadersAttr = true;
    if (spanExceedsOne(tag)) return true;
  }

  const rowTags = tags.filter((tag) => {
    const name = tagNameOf(tag);
    return name === "tr";
  });
  for (const row of rowTags) {
    const rowElement = jsxElementOf(row);
    if (!rowElement) continue;
    const cells = descendantTags(rowElement).filter((tag) => {
      const name = tagNameOf(tag);
      return name === "td" || name === "th";
    });
    dataCols = Math.max(dataCols, cells.length);
  }

  if (hasHeadersAttr) return true;
  if (theadCount > 1) return true;
  if (headerRows > 1 && dataRows > 0 && dataCols > 3 && rowTags.length > 3) {
    return true;
  }

  return false;
}

const NAMING_HOSTS = new Set(["button", "a", "label", "summary"]);

/** True when the node sits inside a control that typically names its graphic. */
export function isInsideNamingHost(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxElement(current)) {
      if (NAMING_HOSTS.has(tagNameOf(current.openingElement).toLowerCase())) {
        return true;
      }
    } else if (ts.isJsxSelfClosingElement(current)) {
      if (NAMING_HOSTS.has(tagNameOf(current).toLowerCase())) return true;
    }
    current = current.parent;
  }
  return false;
}
