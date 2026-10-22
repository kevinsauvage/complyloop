import { dom } from "aria-query";

import {
  booleanAttributeValue,
  getAttribute,
  type JsxTagNode,
  stringValueOf,
} from "./parse.ts";

export function isDomHost(tag: string): boolean {
  return tag === tag.toLowerCase() && dom.has(tag);
}

export function explicitRoles(node: JsxTagNode): string[] {
  const attr = getAttribute(node, "role");
  const value = attr ? stringValueOf(attr) : undefined;
  if (!value) return [];
  return value
    .trim()
    .split(/\s+/)
    .filter((role) => role.length > 0);
}

export function isPresentationRole(node: JsxTagNode): boolean {
  return explicitRoles(node).some(
    (role) => role === "none" || role === "presentation",
  );
}

/** True when aria-hidden is statically true. Unknown expressions are not hidden. */
function isAriaHidden(node: JsxTagNode): boolean {
  return booleanAttributeValue(getAttribute(node, "aria-hidden")) === true;
}

/** Shortcut for the common decorative-or-hidden guard used across naming checks. */
export function isDecorativeOrHidden(node: JsxTagNode): boolean {
  return isAriaHidden(node) || isPresentationRole(node);
}
