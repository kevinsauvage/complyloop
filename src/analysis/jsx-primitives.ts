import ts from "typescript";
import { getAttribute, type JsxTagNode } from "./parse";

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

/**
 * Accessible-name ARIA attributes. `title` is included by default (buttons /
 * links); headings typically ignore it.
 */
export function hasAriaName(
  node: JsxTagNode,
  options: { includeTitle?: boolean } = {},
): boolean {
  const includeTitle = options.includeTitle !== false;
  return (
    getAttribute(node, "aria-label") !== undefined ||
    getAttribute(node, "aria-labelledby") !== undefined ||
    (includeTitle && getAttribute(node, "title") !== undefined)
  );
}
