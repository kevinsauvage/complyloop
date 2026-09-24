import ts from "typescript";

import {
  booleanAttributeValue,
  getAttribute,
  hasAriaName,
  hasTextContent,
  humanizeFileName,
  isPropSpreadingHost,
  jsxElementOf,
  type JsxTagNode,
  locationOf,
  spanOf,
  stringValueOf,
  tagNameOf,
  visitJsxElements,
  visitJsxTags,
} from "../../parse.ts";
import {
  CAPTCHA_COMPONENT_HOSTS,
  ERROR_PREVENTION_CONFIRM_DATA_ATTRS,
} from "../../patterns/error-prevention-criteria.ts";
import {
  AGREE_LABEL,
  CAPTCHA_ALTERNATIVE,
  CAPTCHA_TOKEN,
  CONFIRM_LABEL,
  HIGH_RISK,
  matchesMultilingual,
  stripConsentBoilerplate,
} from "../../patterns/multilingual.ts";
import { isObjectRecognitionCaptchaSignal } from "../../patterns/object-recognition-captcha.ts";
import type { AccessibilityCheck, RawFinding } from "../../types.ts";
import { AUTH_AUTOCOMPLETE, isAuthField } from "../auth-field.ts";
import {
  attributeContextOf,
  descendantTags,
  tagNodeOfJsxChild,
  textContentOf,
} from "../heuristic-utils.ts";

const UNLABELED_EXEMPT_TYPES = new Set([
  "hidden",
  "submit",
  "reset",
  "button",
  "image",
]);

const LABELED_TAGS = new Set(["input", "select", "textarea"]);

function collectLabelTargets(sourceFile: ts.SourceFile): Set<string> {
  const targets = new Set<string>();
  visitJsxTags(sourceFile, (node) => {
    if (tagNameOf(node) !== "label") return;
    const htmlFor = getAttribute(node, "htmlFor");
    const value = htmlFor ? stringValueOf(htmlFor) : undefined;
    if (value) targets.add(value);
  });
  return targets;
}

function defaultLabelFor(node: JsxTagNode): string {
  const nameAttr =
    getAttribute(node, "name") ?? getAttribute(node, "placeholder");
  const value = nameAttr ? stringValueOf(nameAttr) : undefined;
  const humanized = value ? humanizeFileName(value) : "";
  return humanized.length > 0 ? humanized : "Describe this field";
}

export const inputLabelCheck: AccessibilityCheck = {
  id: "input-label",
  run(source) {
    const labelTargets = collectLabelTargets(source.sourceFile);
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (!LABELED_TAGS.has(tag)) return;
      // Design-system primitives spread props; labels live at call sites.
      if (isPropSpreadingHost(node)) return;

      if (tag === "input") {
        const type = getAttribute(node, "type");
        const typeValue = type ? stringValueOf(type) : undefined;
        if (typeValue && UNLABELED_EXEMPT_TYPES.has(typeValue)) return;
      }

      if (
        getAttribute(node, "aria-label") !== undefined ||
        getAttribute(node, "aria-labelledby") !== undefined
      ) {
        return;
      }

      const id = getAttribute(node, "id");
      const idValue = id ? stringValueOf(id) : undefined;
      if (idValue && labelTargets.has(idValue)) return;

      findings.push({
        checkId: "input-label",
        kind: "violation",
        severity: "serious",
        // The label association is only checked within the same file.
        confidence: "medium",
        reason: `<${tag}> has no associated <label>, aria-label, or aria-labelledby, so users cannot tell what to enter.`,
        location: locationOf(source, node),
        fix: {
          kind: "insert_attribute",
          attribute: "aria-label",
          value: defaultLabelFor(node),
          editable: true,
          span: spanOf(node, source.sourceFile),
        },
      });
    });
    return findings;
  },
};

const FORM_CONTROLS = new Set(["input", "select", "textarea"]);

function isAriaTrue(attr: ReturnType<typeof getAttribute>): boolean {
  const value = booleanAttributeValue(attr);
  // Dynamic expression — treat as potentially invalid so humans can review.
  return value === true || value === null;
}

/** Collects static string literals nested in an expression (ternaries, &&, templates). */
function collectStringLiterals(node: ts.Node, into: Set<string>): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    for (const id of node.text.split(/\s+/)) {
      if (id) into.add(id);
    }
    return;
  }
  if (ts.isTemplateExpression(node)) {
    for (const span of node.templateSpans) {
      collectStringLiterals(span.expression, into);
    }
    return;
  }
  ts.forEachChild(node, (child) => collectStringLiterals(child, into));
}

function describedByIdsFromAttribute(attr: ts.JsxAttribute): Set<string> {
  const ids = new Set<string>();
  const literal = stringValueOf(attr);
  if (literal) {
    for (const id of literal.split(/\s+/)) {
      if (id) ids.add(id);
    }
    return ids;
  }
  const initializer = attr.initializer;
  if (
    initializer &&
    ts.isJsxExpression(initializer) &&
    initializer.expression
  ) {
    collectStringLiterals(initializer.expression, ids);
  }
  return ids;
}

/**
 * Pragmatic heuristics:
 * - aria-invalid without aria-describedby (error not associated)
 * - id containing "error" that nothing references via aria-describedby
 *   (including string literals inside conditional expressions)
 */
export const formErrorAssociationCheck: AccessibilityCheck = {
  id: "form-error-association",
  run(source) {
    const findings: RawFinding[] = [];
    const describedByTargets = new Set<string>();

    visitJsxTags(source.sourceFile, (node) => {
      const describedBy = getAttribute(node, "aria-describedby");
      if (!describedBy) return;
      for (const id of describedByIdsFromAttribute(describedBy)) {
        describedByTargets.add(id);
      }
    });

    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node).toLowerCase();
      if (FORM_CONTROLS.has(tag)) {
        if (isPropSpreadingHost(node)) return;
        const invalid = getAttribute(node, "aria-invalid");
        if (isAriaTrue(invalid) && !getAttribute(node, "aria-describedby")) {
          findings.push({
            checkId: "form-error-association",
            kind: "violation",
            severity: "serious",
            confidence: "medium",
            reason: `<${tag}> is marked aria-invalid but has no aria-describedby linking to an error message.`,
            location: locationOf(source, node),
            fix: null,
          });
        }
      }

      const idAttr = getAttribute(node, "id");
      const idValue = idAttr ? stringValueOf(idAttr) : undefined;
      if (
        idValue &&
        /error/i.test(idValue) &&
        !describedByTargets.has(idValue)
      ) {
        findings.push({
          checkId: "form-error-association",
          kind: "warning",
          severity: "moderate",
          confidence: "low",
          reason: `Element id="${idValue}" looks like an error message but no control references it via aria-describedby.`,
          location: locationOf(source, node),
          fix: null,
        });
      }
    });

    return findings;
  },
};

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
      if (
        tag === "fieldset" ||
        roleValue === "group" ||
        roleValue === "radiogroup"
      ) {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}

function siblingIndex(
  node: JsxTagNode,
): { parent: ts.Node; index: number } | null {
  const self = ts.isJsxOpeningElement(node) ? node.parent : node;
  const parent = self.parent;
  if (!ts.isJsxElement(parent) && !ts.isJsxFragment(parent)) return null;
  const index = parent.children.indexOf(self);
  if (index < 0) return null;
  return { parent, index };
}

function autocompleteToken(node: JsxTagNode): string | undefined {
  const attr =
    getAttribute(node, "autocomplete") ?? getAttribute(node, "autoComplete");
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
      const type = typeAttr
        ? stringValueOf(typeAttr)?.toLowerCase()
        : undefined;
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
      const ordered = [...inputs].sort(
        (left, right) => left.index - right.index,
      );
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

function roleOf(node: JsxTagNode): string | undefined {
  const attr = getAttribute(node, "role");
  return attr ? stringValueOf(attr) : undefined;
}

function isGroupingHost(node: JsxTagNode): boolean {
  if (tagNameOf(node) === "fieldset") return true;
  const role = roleOf(node);
  return role === "group" || role === "radiogroup";
}

function isInsideLegendGrouping(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxElement(current) && isGroupingHost(current.openingElement)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function groupingHasLegend(node: JsxTagNode): boolean {
  if (hasAriaName(node)) return true;
  const element = jsxElementOf(node);
  if (!element) return false;
  for (const child of element.children) {
    if (!ts.isJsxElement(child)) continue;
    if (tagNameOf(child.openingElement) !== "legend") continue;
    if (hasAriaName(child.openingElement)) return true;
    if (hasTextContent(child)) return true;
  }
  return false;
}

export const fieldsetLegendCheck: AccessibilityCheck = {
  id: "fieldset-legend",
  run(source) {
    const findings: RawFinding[] = [];
    const radiosByName = new Map<string, JsxTagNode[]>();

    visitJsxTags(source.sourceFile, (node) => {
      if (isGroupingHost(node) && !groupingHasLegend(node)) {
        findings.push({
          checkId: "fieldset-legend",
          kind: "violation",
          severity: "serious",
          confidence: "high",
          reason:
            "Field grouping has no legend or accessible name, so users cannot tell what the grouped fields are for.",
          location: locationOf(source, node),
          fix: null,
        });
      }

      if (tagNameOf(node) !== "input") return;
      const typeAttr = getAttribute(node, "type");
      const type = typeAttr ? stringValueOf(typeAttr) : undefined;
      if (type !== "radio") return;
      const nameAttr = getAttribute(node, "name");
      const name = nameAttr ? stringValueOf(nameAttr) : undefined;
      if (!name) return;
      const group = radiosByName.get(name) ?? [];
      group.push(node);
      radiosByName.set(name, group);
    });

    for (const group of radiosByName.values()) {
      if (group.length < 2) continue;
      if (group.every((node) => isInsideLegendGrouping(node))) continue;
      const first = group[0];
      if (!first) continue;
      const nameAttr = getAttribute(first, "name");
      const nameValue = nameAttr ? stringValueOf(nameAttr) : "radio";
      findings.push({
        checkId: "fieldset-legend",
        kind: "violation",
        severity: "serious",
        confidence: "medium",
        reason: `Radio group name="${nameValue}" is not wrapped in a fieldset or labelled group.`,
        location: locationOf(source, first),
        fix: null,
      });
    }

    return findings;
  },
};

export const optgroupCheck: AccessibilityCheck = {
  id: "optgroup",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "optgroup") return;
      if (isPropSpreadingHost(node)) return;
      if (hasAriaName(node)) return;

      const label = getAttribute(node, "label");
      if (label) {
        const value = stringValueOf(label);
        if (value === undefined || value.trim().length > 0) return;
      }

      findings.push({
        checkId: "optgroup",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          "<optgroup> has no label, so assistive technologies cannot announce the group name.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

const PURPOSE_TYPES = new Set(["email", "password", "tel", "url"]);

const PURPOSE_NAMES =
  /^(email|username|user[_-]?name|password|name|given-?name|family-?name|tel|phone|street-?address|address|postal-?code|zip|city|country)$/i;

const SKIP_TYPES = new Set([
  "hidden",
  "checkbox",
  "radio",
  "submit",
  "reset",
  "button",
  "file",
  "image",
  "range",
  "color",
  "search",
]);

function needsPurpose(node: JsxTagNode): boolean {
  const tag = tagNameOf(node);
  if (tag !== "input") return false;
  const typeAttr = getAttribute(node, "type");
  const type = (typeAttr ? stringValueOf(typeAttr) : "text") ?? "text";
  if (SKIP_TYPES.has(type)) return false;
  if (PURPOSE_TYPES.has(type)) return true;
  const nameAttr = getAttribute(node, "name") ?? getAttribute(node, "id");
  const name = nameAttr ? stringValueOf(nameAttr) : undefined;
  return Boolean(name && PURPOSE_NAMES.test(name));
}

export const autocompletePurposeCheck: AccessibilityCheck = {
  id: "autocomplete-purpose",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!needsPurpose(node)) return;
      if (
        getAttribute(node, "autoComplete") !== undefined ||
        getAttribute(node, "autocomplete") !== undefined
      ) {
        return;
      }

      findings.push({
        checkId: "autocomplete-purpose",
        kind: "violation",
        severity: "moderate",
        confidence: "high",
        reason:
          "Identity field has no autocomplete token, so browsers and password managers cannot fill it (WCAG 1.3.5).",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

function collectFormHosts(sourceFile: ts.SourceFile): JsxTagNode[] {
  const hosts: JsxTagNode[] = [];
  visitJsxTags(sourceFile, (node) => {
    if (tagNameOf(node) === "form") hosts.push(node);
  });
  return hosts;
}

function textAroundForm(formNode: JsxTagNode): string {
  const parts: string[] = [];
  const element = jsxElementOf(formNode);
  if (element) parts.push(textContentOf(element));
  for (const name of ["name", "id", "aria-label", "action"]) {
    const attr = getAttribute(formNode, name);
    const value = attr ? stringValueOf(attr) : undefined;
    if (value) parts.push(value);
  }
  // Consent boilerplate ("Terms of Service", "Privacy Policy", …) is not a
  // transaction signal — strip it before HIGH_RISK matching.
  return stripConsentBoilerplate(parts.join(" "));
}

function subtreeHasSafeguard(formNode: JsxTagNode): boolean {
  const element = jsxElementOf(formNode);
  if (!element) return false;

  for (const tag of descendantTags(element)) {
    const tagName = tagNameOf(tag);
    if (tagName === "input") {
      const typeAttr = getAttribute(tag, "type");
      const type = (typeAttr ? stringValueOf(typeAttr) : "text") ?? "text";
      if (type === "checkbox") {
        const labelText = accessibleTextOf(tag, element);
        if (AGREE_LABEL.test(labelText)) return true;
      }
    }

    if (tagName === "button") {
      const typeAttr = getAttribute(tag, "type");
      const type = typeAttr ? stringValueOf(typeAttr)?.toLowerCase() : "submit";
      const labelText = accessibleTextOf(tag, element);
      if (
        matchesMultilingual(CONFIRM_LABEL, labelText) ||
        matchesMultilingual(AGREE_LABEL, labelText)
      ) {
        return true;
      }
      if (type === "button") {
        continue;
      }
    }
  }

  for (const name of ERROR_PREVENTION_CONFIRM_DATA_ATTRS) {
    if (getAttribute(formNode, name)) return true;
  }

  return false;
}

function accessibleTextOf(tag: JsxTagNode, formElement: ts.JsxElement): string {
  const ariaLabel = getAttribute(tag, "aria-label");
  const ariaValue = ariaLabel ? stringValueOf(ariaLabel) : undefined;
  if (ariaValue) return ariaValue;
  const child = jsxElementOf(tag);
  if (child) return textContentOf(child);
  return textContentOf(formElement);
}

function handlerUsesConfirm(formNode: JsxTagNode): boolean {
  for (const name of ["onSubmit", "onClick"]) {
    const attr = getAttribute(formNode, name);
    if (!attr?.initializer || !ts.isJsxExpression(attr.initializer)) continue;
    const expression = attr.initializer.expression;
    if (!expression) continue;
    if (/\bconfirm\s*\(/.test(expression.getText())) return true;
  }
  return false;
}

export const errorPreventionCheck: AccessibilityCheck = {
  id: "error-prevention",
  run(source) {
    const findings: RawFinding[] = [];
    const forms = collectFormHosts(source.sourceFile);

    for (const formNode of forms) {
      const context = textAroundForm(formNode);
      if (!matchesMultilingual(HIGH_RISK, context)) continue;
      if (subtreeHasSafeguard(formNode) || handlerUsesConfirm(formNode)) {
        continue;
      }

      findings.push({
        checkId: "error-prevention",
        kind: "warning",
        severity: "serious",
        confidence: "medium",
        reason:
          "High-impact form may submit without a review, confirm, or agreement step (WCAG 3.3.4 / RGAA 11.12).",
        location: locationOf(source, formNode),
        fix: null,
      });
    }

    visitJsxElements(source.sourceFile, (element) => {
      const opening = element.openingElement;
      if (tagNameOf(opening) === "form") return;
      const text = textContentOf(element);
      if (!matchesMultilingual(HIGH_RISK, stripConsentBoilerplate(text)))
        return;

      const submitLike = descendantTags(element).some((tag) => {
        const name = tagNameOf(tag);
        if (name !== "button") return false;
        const typeAttr = getAttribute(tag, "type");
        const type = typeAttr
          ? stringValueOf(typeAttr)?.toLowerCase()
          : "submit";
        // Only an absent attribute (HTML default) or an explicit literal counts
        // as submit; a dynamic expression has an unknown type.
        return type === "submit";
      });
      if (!submitLike) return;

      const safeguard = descendantTags(element).some((tag) => {
        const label = accessibleTextOf(tag, element);
        return (
          matchesMultilingual(CONFIRM_LABEL, label) ||
          matchesMultilingual(AGREE_LABEL, label)
        );
      });
      if (safeguard) return;

      findings.push({
        checkId: "error-prevention",
        kind: "warning",
        severity: "serious",
        confidence: "low",
        reason:
          "Component with a high-impact submit action may lack a confirm or review step (WCAG 3.3.4).",
        location: locationOf(source, opening),
        fix: null,
      });
    });

    return findings;
  },
};

const IDENTITY_AUTOCOMPLETE = new Set([
  "email",
  "username",
  "name",
  "given-name",
  "family-name",
  "tel",
  "street-address",
  "postal-code",
  "country",
]);

const IDENTITY_TYPES = new Set(["email", "tel", "text", "password"]);

interface FieldRef {
  key: string;
  node: Parameters<typeof locationOf>[1];
}

function fieldKey(node: Parameters<typeof getAttribute>[0]): string | null {
  const tag = tagNameOf(node);
  if (tag !== "input") return null;
  const typeAttr = getAttribute(node, "type");
  const type = (typeAttr ? stringValueOf(typeAttr) : "text") ?? "text";
  if (!IDENTITY_TYPES.has(type)) return null;

  const auto =
    getAttribute(node, "autoComplete") ?? getAttribute(node, "autocomplete");
  const token = auto ? stringValueOf(auto)?.toLowerCase() : undefined;
  if (token && IDENTITY_AUTOCOMPLETE.has(token)) return token;

  const nameAttr = getAttribute(node, "name") ?? getAttribute(node, "id");
  const name = nameAttr ? stringValueOf(nameAttr)?.toLowerCase() : undefined;
  if (!name) return null;
  if (IDENTITY_AUTOCOMPLETE.has(name)) return name;
  if (/email|username|phone|address|postal|zip|country|name/.test(name)) {
    return name;
  }
  return null;
}

function hasHiddenCarryover(sourceFile: ts.SourceFile, key: string): boolean {
  let found = false;
  visitJsxTags(sourceFile, (node) => {
    if (found) return;
    if (tagNameOf(node) !== "input") return;
    const typeAttr = getAttribute(node, "type");
    const type = (typeAttr ? stringValueOf(typeAttr) : "text") ?? "text";
    if (type !== "hidden") return;
    const nameAttr = getAttribute(node, "name") ?? getAttribute(node, "id");
    const name = nameAttr ? stringValueOf(nameAttr)?.toLowerCase() : undefined;
    if (name && (name === key || name.includes(key))) found = true;
  });
  return found;
}

export const redundantEntryCheck: AccessibilityCheck = {
  id: "redundant-entry",
  run(source) {
    const fields: FieldRef[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const key = fieldKey(node);
      if (!key) return;
      fields.push({ key, node });
    });

    const counts = new Map<string, FieldRef[]>();
    for (const field of fields) {
      const bucket = counts.get(field.key) ?? [];
      bucket.push(field);
      counts.set(field.key, bucket);
    }

    const findings: RawFinding[] = [];
    for (const [key, bucket] of counts) {
      if (bucket.length < 2) continue;
      if (hasHiddenCarryover(source.sourceFile, key)) continue;
      for (const field of bucket.slice(1)) {
        findings.push({
          checkId: "redundant-entry",
          kind: "warning",
          severity: "moderate",
          confidence: "low",
          reason: `Identity field "${key}" is collected more than once without a hidden carry-over or autocomplete reuse (WCAG 3.3.7).`,
          location: locationOf(source, field.node),
          fix: null,
        });
      }
    }
    return findings;
  },
};

function blocksPaste(node: Parameters<typeof getAttribute>[0]): boolean {
  const paste = getAttribute(node, "onPaste");
  if (!paste?.initializer || !ts.isJsxExpression(paste.initializer)) {
    return false;
  }
  const expression = paste.initializer.expression;
  if (!expression) return false;
  const text = expression.getText();
  return text.includes("preventDefault");
}

export const accessibleAuthCheck: AccessibilityCheck = {
  id: "accessible-auth",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!isAuthField(node)) return;

      const auto =
        getAttribute(node, "autoComplete") ??
        getAttribute(node, "autocomplete");
      if (auto) {
        const value = stringValueOf(auto)?.toLowerCase();
        if (value === "off" || value === "false") {
          findings.push({
            checkId: "accessible-auth",
            kind: "violation",
            severity: "serious",
            confidence: "high",
            reason:
              "Authentication field disables autocomplete, blocking password managers and assistive fill (WCAG 3.3.8).",
            location: locationOf(source, node),
            fix: null,
          });
        }
      }

      if (blocksPaste(node)) {
        findings.push({
          checkId: "accessible-auth",
          kind: "violation",
          severity: "serious",
          confidence: "high",
          reason:
            "Authentication field blocks paste, preventing password managers from filling credentials (WCAG 3.3.8).",
          location: locationOf(source, node),
          fix: null,
        });
      }

      const readOnly =
        getAttribute(node, "readOnly") ?? getAttribute(node, "readonly");
      if (readOnly && booleanAttributeValue(readOnly)) {
        const autoValue = auto ? stringValueOf(auto)?.toLowerCase() : undefined;
        if (autoValue && AUTH_AUTOCOMPLETE.has(autoValue)) {
          findings.push({
            checkId: "accessible-auth",
            kind: "warning",
            severity: "moderate",
            confidence: "low",
            reason:
              "Read-only authentication field may block user-controlled entry; confirm users can paste or use autofill (WCAG 3.3.8).",
            location: locationOf(source, node),
            fix: null,
          });
        }
      }
    });
    return findings;
  },
};

function isObjectRecognitionCaptcha(
  node: Parameters<typeof getAttribute>[0],
): boolean {
  const ariaLabel = getAttribute(node, "aria-label");
  const labelText = ariaLabel ? (stringValueOf(ariaLabel) ?? "") : "";
  const size = getAttribute(node, "size");
  const challenge = getAttribute(node, "challenge");

  return isObjectRecognitionCaptchaSignal({
    tagName: tagNameOf(node),
    contextText: `${attributeContextOf(node)} ${labelText}`,
    hasSizeOrChallengeAttr: Boolean(size || challenge),
  });
}

function authContextNearby(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  let foundAuth = false;
  visitJsxTags(sourceFile, (candidate) => {
    if (foundAuth) return;
    if (!isAuthField(candidate)) return;
    if (
      candidate.getStart() >= node.getStart() - 4000 &&
      candidate.getStart() <= node.getEnd() + 4000
    ) {
      foundAuth = true;
    }
  });
  return foundAuth;
}

export const accessibleAuthEnhancedCheck: AccessibilityCheck = {
  id: "accessible-auth-enhanced",
  run(source) {
    const findings: RawFinding[] = [];

    visitJsxTags(source.sourceFile, (node) => {
      if (!isObjectRecognitionCaptcha(node)) return;
      if (!authContextNearby(node, source.sourceFile)) return;

      findings.push({
        checkId: "accessible-auth-enhanced",
        kind: "warning",
        severity: "serious",
        confidence: "medium",
        reason:
          "Authentication may require object-recognition or image-selection CAPTCHA without an allowed alternative (WCAG 3.3.9).",
        location: locationOf(source, node),
        fix: null,
      });
    });

    return findings;
  },
};

const CAPTCHA_HOSTS = new Set<string>(CAPTCHA_COMPONENT_HOSTS);

function isCaptchaHost(node: JsxTagNode): boolean {
  const tag = tagNameOf(node);
  if (CAPTCHA_HOSTS.has(tag)) return true;
  return matchesMultilingual(CAPTCHA_TOKEN, attributeContextOf(node));
}

function controlLabel(tag: JsxTagNode): string {
  const child = jsxElementOf(tag);
  const ariaLabel = getAttribute(tag, "aria-label");
  const href = getAttribute(tag, "href");
  return [
    ariaLabel ? (stringValueOf(ariaLabel) ?? "") : "",
    child ? textContentOf(child) : "",
    href ? (stringValueOf(href) ?? "") : "",
  ].join(" ");
}

function subtreeHasAlternative(node: JsxTagNode): boolean {
  const element = jsxElementOf(node);
  if (!element) return false;

  for (const tag of descendantTags(element)) {
    const tagName = tagNameOf(tag);
    if (tagName === "a" || tagName === "button") {
      if (matchesMultilingual(CAPTCHA_ALTERNATIVE, controlLabel(tag)))
        return true;
    }
    if (tagName === "audio") return true;
  }

  for (const name of ["audioCaptcha", "audioChallenge", "data-audio-captcha"]) {
    if (getAttribute(node, name)) return true;
  }

  return false;
}

function containerHasAlternative(node: JsxTagNode): boolean {
  if (subtreeHasAlternative(node)) return true;

  const self = ts.isJsxOpeningElement(node) ? node.parent : node;
  const parent = self.parent;
  if (!ts.isJsxElement(parent) && !ts.isJsxFragment(parent)) return false;

  for (const child of parent.children) {
    if (child === self) continue;
    const tag = tagNodeOfJsxChild(child);
    if (!tag) continue;
    if (subtreeHasAlternative(tag)) return true;
    const tagName = tagNameOf(tag);
    if (tagName === "a" || tagName === "button") {
      if (matchesMultilingual(CAPTCHA_ALTERNATIVE, controlLabel(tag)))
        return true;
    }
  }

  return false;
}

function findCaptchaAncestor(node: ts.Node): JsxTagNode | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxElement(current)) {
      const opening = current.openingElement;
      if (isCaptchaHost(opening)) return opening;
    } else if (ts.isJsxSelfClosingElement(current)) {
      if (isCaptchaHost(current)) return current;
    }
    current = current.parent;
  }
  return undefined;
}

export const captchaAlternativeCheck: AccessibilityCheck = {
  id: "captcha-alternative",
  run(source) {
    const findings: RawFinding[] = [];
    const reported = new Set<string>();

    visitJsxTags(source.sourceFile, (node) => {
      if (!isCaptchaHost(node)) return;
      const key = node.getSourceFile().fileName + node.getStart();
      if (reported.has(key)) return;
      reported.add(key);

      if (containerHasAlternative(node)) return;

      findings.push({
        checkId: "captcha-alternative",
        kind: "warning",
        severity: "serious",
        confidence: "medium",
        reason:
          "CAPTCHA component does not expose an audio, logic, or human-contact alternative (RGAA 1.5 / WCAG 1.1.1).",
        location: locationOf(source, node),
        fix: null,
      });
    });

    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "img") return;
      const alt = getAttribute(node, "alt");
      const src = getAttribute(node, "src");
      const altText = alt ? (stringValueOf(alt) ?? "") : "";
      const srcText = src ? (stringValueOf(src) ?? "") : "";
      if (!matchesMultilingual(CAPTCHA_TOKEN, `${altText} ${srcText}`)) return;

      const host = findCaptchaAncestor(node) ?? node;
      if (containerHasAlternative(host)) return;

      findings.push({
        checkId: "captcha-alternative",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "Image CAPTCHA may lack a non-visual alternative modality nearby (RGAA 1.5).",
        location: locationOf(source, node),
        fix: null,
      });
    });

    return findings;
  },
};
