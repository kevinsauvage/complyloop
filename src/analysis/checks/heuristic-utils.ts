import ts from "typescript";
import { getAttribute, type JsxTagNode } from "../parse";

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
