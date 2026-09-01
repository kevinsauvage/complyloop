import ts from "typescript";
import { getAttribute, locationOf, stringValueOf, tagNameOf, visitJsxTags, type JsxTagNode } from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

interface IndexedInput {
  node: JsxTagNode;
  index: number;
  token: string;
}

function isInsideGrouping(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxElement(current)) {
      const host = current.openingElement;
      const tag = tagNameOf(host);
      const role = getAttribute(host, "role");
      const roleValue = role ? stringValueOf(role) : undefined;
      if (tag === "fieldset" || roleValue === "group" || roleValue === "radiogroup") {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}

function siblingIndex(node: JsxTagNode): { parent: ts.Node; index: number } | null {
  const self = ts.isJsxOpeningElement(node) ? node.parent : node;
  const parent = self.parent;
  if (!ts.isJsxElement(parent) && !ts.isJsxFragment(parent)) return null;
  const index = parent.children.indexOf(self);
  if (index < 0) return null;
  return { parent, index };
}

function autocompleteToken(node: JsxTagNode): string | undefined {
  const attr = getAttribute(node, "autocomplete") ?? getAttribute(node, "autoComplete");
  const value = attr ? stringValueOf(attr) : undefined;
  return value?.trim().toLowerCase();
}

function identityPair(left: string, right: string): boolean {
  return (
    (left === "given-name" && right === "family-name") ||
    (left === "address-line1" && right === "address-line2")
  );
}

export const fieldGroupingCheck: AccessibilityCheck = {
  id: "field-grouping",
  run(source) {
    const findings: RawFinding[] = [];
    const checkboxGroups = new Map<string, JsxTagNode[]>();
    const indexedInputs = new Map<ts.Node, IndexedInput[]>();

    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "input") return;
      if (isInsideGrouping(node)) return;

      const typeAttr = getAttribute(node, "type");
      const type = typeAttr ? stringValueOf(typeAttr)?.toLowerCase() : undefined;
      if (type === "checkbox") {
        const nameAttr = getAttribute(node, "name");
        const name = nameAttr ? stringValueOf(nameAttr) : undefined;
        if (name) {
          const group = checkboxGroups.get(name) ?? [];
          group.push(node);
          checkboxGroups.set(name, group);
        }
      }

      const token = autocompleteToken(node);
      if (!token) return;
      if (
        token !== "given-name" &&
        token !== "family-name" &&
        token !== "address-line1" &&
        token !== "address-line2"
      ) {
        return;
      }
      const indexed = siblingIndex(node);
      if (!indexed) return;
      const inputs = indexedInputs.get(indexed.parent) ?? [];
      inputs.push({ node, index: indexed.index, token });
      indexedInputs.set(indexed.parent, inputs);
    });

    for (const [name, group] of checkboxGroups.entries()) {
      if (group.length < 2) continue;
      const first = group[0];
      if (!first) continue;
      findings.push({
        checkId: "field-grouping",
        kind: "violation",
        severity: "serious",
        confidence: "medium",
        reason: `Checkboxes with name="${name}" are related but not grouped in a fieldset or labelled group.`,
        location: locationOf(source, first),
        fix: null,
      });
    }

    for (const inputs of indexedInputs.values()) {
      const ordered = [...inputs].sort((left, right) => left.index - right.index);
      for (let index = 0; index < ordered.length - 1; index += 1) {
        const left = ordered[index];
        const right = ordered[index + 1];
        if (!left || !right) continue;
        if (!identityPair(left.token, right.token)) continue;
        findings.push({
          checkId: "field-grouping",
          kind: "violation",
          severity: "serious",
          confidence: "medium",
          reason:
            "Related identity fields should be grouped in a fieldset or labelled group so users understand they belong together.",
          location: locationOf(source, left.node),
          fix: null,
        });
        break;
      }
    }

    return findings;
  },
};
