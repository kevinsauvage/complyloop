import type { ARIARoleRelationConcept } from "aria-query";
import { dom, elementRoles, roles } from "aria-query";
import { AXObjects, elementAXObjects } from "axobject-query";
import ts from "typescript";
import {
  booleanAttributeValue,
  getAttribute,
  stringValueOf,
  tagNameOf,
  type JsxTagNode,
} from "./parse";

interface ConceptAttribute {
  name: string;
  value?: string | number;
  constraints?: ReadonlyArray<string>;
}

interface ElementConcept {
  name: string;
  attributes?: ReadonlyArray<ConceptAttribute>;
}

interface StaticAttribute {
  name: string;
  value?: string;
}

const widgetRoleNames = new Set<string>(
  roles.keys().filter((name) => {
    const definition = roles.get(name);
    if (!definition || definition.abstract) return false;
    // progressbar inherits widget but is readonly in practice.
    if (name === "progressbar") return false;
    // toolbar is not a widget in the spec but supports aria-activedescendant.
    if (name === "toolbar") return true;
    return definition.superClass.some((chain) => chain.includes("widget"));
  }),
);

const widgetAxObjectNames = new Set(
  AXObjects.keys().filter((name) => AXObjects.get(name)?.type === "widget"),
);

function conceptFromRoleRelation(
  schema: ARIARoleRelationConcept,
): ElementConcept {
  return {
    name: schema.name,
    attributes: schema.attributes,
  };
}

const interactiveRoleConcepts: ElementConcept[] = elementRoles
  .entries()
  .filter(([, roleSet]) =>
    [...roleSet].some((role) => widgetRoleNames.has(role)),
  )
  .map(([schema]) => conceptFromRoleRelation(schema));

const interactiveAxConcepts: ElementConcept[] = elementAXObjects
  .entries()
  .filter(
    ([, names]) =>
      names.length > 0 && names.every((name) => widgetAxObjectNames.has(name)),
  )
  .map(([schema]) => schema);

function attributeSatisfies(
  required: ConceptAttribute,
  attrs: ReadonlyArray<StaticAttribute>,
): boolean {
  const found = attrs.find((attr) => attr.name === required.name);
  const constraints = required.constraints ?? [];
  if (constraints.includes("undefined")) return found === undefined;
  if (constraints.includes("set")) return found !== undefined;
  if (found === undefined) return false;
  if (constraints.includes(">1")) {
    const n = Number(found.value);
    return Number.isFinite(n) && n > 1;
  }
  if (required.value !== undefined) {
    return found.value === String(required.value);
  }
  return true;
}

function conceptMatches(
  concept: ElementConcept,
  tag: string,
  attrs: ReadonlyArray<StaticAttribute>,
): boolean {
  if (concept.name !== tag) return false;
  return (concept.attributes ?? []).every((required) =>
    attributeSatisfies(required, attrs),
  );
}

function htmlAttributeName(jsxName: string): string {
  switch (jsxName) {
    case "tabIndex":
      return "tabindex";
    case "contentEditable":
      return "contenteditable";
    case "autoPlay":
      return "autoplay";
    default:
      return jsxName.toLowerCase();
  }
}

function staticAttributes(node: JsxTagNode): StaticAttribute[] {
  const attrs: StaticAttribute[] = [];
  for (const prop of node.attributes.properties) {
    if (!ts.isJsxAttribute(prop)) continue;
    const name = htmlAttributeName(prop.name.getText());
    if (!prop.initializer) {
      attrs.push({ name });
      continue;
    }
    const text = stringValueOf(prop);
    if (text !== undefined) {
      attrs.push({ name, value: text });
      continue;
    }
    if (
      ts.isJsxExpression(prop.initializer) &&
      prop.initializer.expression
    ) {
      const expr = prop.initializer.expression;
      if (expr.kind === ts.SyntaxKind.TrueKeyword) {
        attrs.push({ name, value: "true" });
      } else if (expr.kind === ts.SyntaxKind.FalseKeyword) {
        attrs.push({ name, value: "false" });
      } else if (ts.isNumericLiteral(expr)) {
        attrs.push({ name, value: expr.text });
      }
    }
  }
  return attrs;
}

function isDisabled(node: JsxTagNode): boolean {
  const disabled = getAttribute(node, "disabled");
  if (disabled) {
    const value = stringValueOf(disabled);
    if (value === undefined || value === "true") return true;
  }
  return booleanAttributeValue(getAttribute(node, "aria-disabled")) === true;
}

function tabIndexValue(node: JsxTagNode): number | undefined {
  const attr =
    getAttribute(node, "tabIndex") ?? getAttribute(node, "tabindex");
  if (!attr) return undefined;
  const text = stringValueOf(attr);
  if (text !== undefined) {
    const n = Number(text);
    return Number.isFinite(n) ? n : undefined;
  }
  if (
    !attr.initializer ||
    !ts.isJsxExpression(attr.initializer) ||
    !attr.initializer.expression
  ) {
    return undefined;
  }
  const expr = attr.initializer.expression;
  if (ts.isNumericLiteral(expr)) return Number(expr.text);
  if (
    ts.isPrefixUnaryExpression(expr) &&
    expr.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expr.operand)
  ) {
    return -Number(expr.operand.text);
  }
  return undefined;
}

function isInherentInteractive(
  tag: string,
  attrs: ReadonlyArray<StaticAttribute>,
): boolean {
  if (!dom.has(tag)) return false;
  return (
    interactiveRoleConcepts.some((concept) =>
      conceptMatches(concept, tag, attrs),
    ) ||
    interactiveAxConcepts.some((concept) =>
      conceptMatches(concept, tag, attrs),
    )
  );
}

function explicitWidgetRole(node: JsxTagNode): boolean {
  const roleAttr = getAttribute(node, "role");
  const role = roleAttr ? stringValueOf(roleAttr) : undefined;
  if (!role) return false;
  return widgetRoleNames.has(role);
}

/**
 * Keyboard/programmatic focusability from ARIA + AXObject tables.
 * Native widgets stay focusable at tabindex={-1} (axe aria-hidden-focus);
 * non-widgets need tabindex >= 0.
 */
export function isFocusable(node: JsxTagNode): boolean {
  if (isDisabled(node)) return false;

  const tag = tagNameOf(node).toLowerCase();
  const attrs = staticAttributes(node);
  const tabIndex = tabIndexValue(node);
  const inherent =
    isInherentInteractive(tag, attrs) ||
    explicitWidgetRole(node) ||
    booleanAttributeValue(getAttribute(node, "contentEditable")) === true ||
    booleanAttributeValue(getAttribute(node, "contenteditable")) === true;

  if (inherent) return true;
  return tabIndex !== undefined && tabIndex >= 0;
}
