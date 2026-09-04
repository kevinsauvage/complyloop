import { aria } from "aria-query";
import ts from "typescript";
import { getAttribute, type JsxTagNode } from "./parse.ts";

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
 * Accessible-name ARIA attributes from aria-query. `title` is included by
 * default (buttons / links); headings typically ignore it.
 */
export function hasAriaName(
  node: JsxTagNode,
  options: { includeTitle?: boolean } = {},
): boolean {
  const includeTitle = options.includeTitle !== false;
  const namedByAria = ARIA_NAME_PROPERTIES.some(
    (property) =>
      aria.has(property) && getAttribute(node, property) !== undefined,
  );
  return (
    namedByAria ||
    (includeTitle && getAttribute(node, "title") !== undefined)
  );
}
