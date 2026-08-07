import ts from "typescript";
import type { JsxTagNode } from "./parse";

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
