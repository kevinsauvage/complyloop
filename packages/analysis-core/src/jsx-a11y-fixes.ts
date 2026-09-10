import type { CheckId } from "./check-registry.ts";
import type { ProposedFix } from "./contract/finding-types.ts";
import {
  attributeRemovalSpan,
  getAttribute,
  type JsxTagNode,
  type ParsedSource,
  spanOf,
  tagNameOf,
  visitJsxTags,
} from "./parse.ts";

function innermostTagAt(parsed: ParsedSource, offset: number): JsxTagNode | undefined {
  let match: JsxTagNode | undefined;
  let matchSize = Number.POSITIVE_INFINITY;
  visitJsxTags(parsed.sourceFile, (node) => {
    const span = spanOf(node, parsed.sourceFile);
    if (offset < span.start || offset >= span.end) return;
    const size = span.end - span.start;
    if (size < matchSize) {
      match = node;
      matchSize = size;
    }
  });
  return match;
}

function insertAttribute(
  parsed: ParsedSource,
  node: JsxTagNode,
  attribute: string,
  value: string,
): ProposedFix {
  return {
    kind: "insert_attribute",
    attribute,
    value,
    editable: true,
    span: spanOf(node, parsed.sourceFile),
  };
}

function removeNamedAttribute(
  parsed: ParsedSource,
  node: JsxTagNode,
  names: readonly string[],
): ProposedFix | null {
  for (const name of names) {
    const attr = getAttribute(node, name);
    if (!attr) continue;
    return {
      kind: "remove_attribute",
      attribute: attr.name.getText(),
      span: attributeRemovalSpan(attr, parsed.sourceFile, parsed.text),
    };
  }
  return null;
}

/**
 * Structured fixes for jsx-a11y findings we can apply the same way as AST
 * checks (insert/remove attribute). Unmapped rules stay without a template.
 */
export function proposedFixForJsxA11y(
  parsed: ParsedSource,
  checkId: CheckId,
  offset: number,
): ProposedFix | null {
  const node = innermostTagAt(parsed, offset);
  if (!node) return null;

  switch (checkId) {
    case "img-alt":
      if (getAttribute(node, "alt")) return null;
      if (tagNameOf(node) !== "img" && tagNameOf(node) !== "Image") return null;
      return insertAttribute(parsed, node, "alt", "Describe this image");
    case "iframe-title":
      if (getAttribute(node, "title")) return null;
      return insertAttribute(parsed, node, "title", "Describe this frame");
    case "html-lang":
      if (getAttribute(node, "lang")) return null;
      return insertAttribute(parsed, node, "lang", "en");
    case "no-autofocus":
      return removeNamedAttribute(parsed, node, ["autoFocus", "autofocus"]);
    case "no-accesskey":
      return removeNamedAttribute(parsed, node, ["accessKey", "accesskey"]);
    // Only a handful of jsx-a11y CheckIds have a structured template.
    default:
      return null;
  }
}
