import { aria, dom, roles, type ARIARoleDefinition } from "aria-query";
import {
  booleanAttributeValue,
  getAttribute,
  stringValueOf,
  tagNameOf,
  type JsxTagNode,
} from "./parse.js";

const ariaPropertyNames = new Set<string>(aria.keys());

const roleDefinitions = new Map<string, ARIARoleDefinition>();
for (const name of roles.keys()) {
  const definition = roles.get(name);
  if (definition) roleDefinitions.set(name, definition);
}

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

export function isConcreteAriaRole(role: string): boolean {
  const definition = roleDefinitions.get(role);
  return definition !== undefined && definition.abstract === false;
}

export function isAriaProperty(name: string): boolean {
  return ariaPropertyNames.has(name.toLowerCase());
}

export interface RequiredAriaProp {
  name: string;
  defaultValue: unknown;
}

export function requiredAriaProps(role: string): RequiredAriaProp[] {
  const definition = roleDefinitions.get(role);
  if (!definition) return [];
  return Object.entries(definition.requiredProps).map(([name, defaultValue]) => ({
    name,
    defaultValue,
  }));
}

export function isPresentationRole(node: JsxTagNode): boolean {
  return explicitRoles(node).some(
    (role) => role === "none" || role === "presentation",
  );
}

/** True when aria-hidden is statically true. Unknown expressions are not hidden. */
export function isAriaHidden(node: JsxTagNode): boolean {
  return booleanAttributeValue(getAttribute(node, "aria-hidden")) === true;
}

/**
 * Native HTML that already implies the role's required ARIA properties
 * (e.g. `<h2 role="heading">` implies aria-level).
 */
export function nativeSatisfiesRole(node: JsxTagNode, role: string): boolean {
  const tag = tagNameOf(node).toLowerCase();
  if (role === "heading" && /^h[1-6]$/.test(tag)) return true;
  if (tag !== "input") return false;
  const typeAttr = getAttribute(node, "type");
  const type = typeAttr ? stringValueOf(typeAttr) : "text";
  if (role === "checkbox" || role === "switch") return type === "checkbox";
  if (role === "radio") return type === "radio";
  return false;
}
