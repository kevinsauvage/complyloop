import ts from "typescript";

import { isDecorativeOrHidden, isPresentationRole } from "../../a11y-aria.ts";
import {
  getAttribute,
  hasAriaName,
  hasTextContent,
  isPropSpreadingHost,
  jsxElementOf,
  type JsxTagNode,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
} from "../../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../../types.ts";
import {
  classNameTextOf,
  descendantTags,
  isComplexDataTable,
  isDataTable,
  textContentOf,
} from "../heuristic-utils.ts";

const HEADING = /^h([1-6])$/i;

export const headingOrderCheck: AccessibilityCheck = {
  id: "heading-order",
  run(source) {
    const findings: RawFinding[] = [];
    let previousLevel = 0;

    visitJsxTags(source.sourceFile, (node) => {
      const match = HEADING.exec(tagNameOf(node));
      if (!match) return;
      const level = Number(match[1]);
      if (previousLevel > 0 && level > previousLevel + 1) {
        findings.push({
          checkId: "heading-order",
          kind: "violation",
          severity: "moderate",
          confidence: "high",
          reason: `Heading level skipped from h${previousLevel} to h${level}; screen reader users lose the document outline.`,
          location: locationOf(source, node),
          fix: null,
        });
      }
      previousLevel = level;
    });

    return findings;
  },
};

const LIST_TAGS = new Set(["ul", "ol", "menu"]);

function enclosingJsxElement(node: ts.Node): ts.JsxElement | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxElement(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function parentListTag(node: JsxTagNode): string | undefined {
  const element = enclosingJsxElement(node);
  // The enclosing element for an opening tag is often the element itself —
  // walk one more level to the parent container.
  const container =
    element && element.openingElement === node
      ? enclosingJsxElement(element)
      : element;
  if (!container) return undefined;
  return tagNameOf(container.openingElement);
}

export const listStructureCheck: AccessibilityCheck = {
  id: "list-structure",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);

      if (tag === "li") {
        const parent = parentListTag(node);
        if (!parent || !LIST_TAGS.has(parent)) {
          findings.push({
            checkId: "list-structure",
            kind: "violation",
            severity: "moderate",
            confidence: parent ? "high" : "medium",
            reason: parent
              ? `<li> must be a direct child of <ul>, <ol>, or <menu> (found under <${parent}>).`
              : "<li> has no list parent in this file; wrap it in <ul>, <ol>, or <menu>.",
            location: locationOf(source, node),
            fix: null,
          });
        }
        return;
      }

      if (!LIST_TAGS.has(tag)) return;
      const element = enclosingJsxElement(node);
      if (!element || element.openingElement !== node) return;

      for (const child of element.children) {
        if (ts.isJsxElement(child)) {
          const childTag = tagNameOf(child.openingElement);
          if (childTag !== "li") {
            findings.push({
              checkId: "list-structure",
              kind: "violation",
              severity: "moderate",
              confidence: "high",
              reason: `<${tag}> contains a direct <${childTag}> child; list children must be <li>.`,
              location: locationOf(source, child.openingElement),
              fix: null,
            });
          }
        } else if (ts.isJsxSelfClosingElement(child)) {
          const childTag = tagNameOf(child);
          if (childTag !== "li") {
            findings.push({
              checkId: "list-structure",
              kind: "violation",
              severity: "moderate",
              confidence: "high",
              reason: `<${tag}> contains a direct <${childTag}> child; list children must be <li>.`,
              location: locationOf(source, child),
              fix: null,
            });
          }
        }
      }
    });
    return findings;
  },
};

const HEADING_CLASS =
  /\b(text-(2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)|text-h[1-6])\b/;

function fontSizeLooksLikeHeading(node: JsxTagNode): boolean {
  const style = getAttribute(node, "style");
  if (!style || !style.initializer || !ts.isJsxExpression(style.initializer)) {
    return false;
  }
  const expression = style.initializer.expression;
  if (!expression || !ts.isObjectLiteralExpression(expression)) return false;
  return expression.properties.some((prop) => {
    if (!ts.isPropertyAssignment(prop) || prop.name.getText() !== "fontSize") {
      return false;
    }
    const text = prop.initializer.getText().replace(/['"`]/g, "");
    const px = /^(\d+(?:\.\d+)?)px$/.exec(text);
    if (px && Number(px[1]) >= 24) return true;
    const rem = /^(\d+(?:\.\d+)?)rem$/.exec(text);
    return Boolean(rem && Number(rem[1]) >= 1.5);
  });
}

export const pAsHeadingCheck: AccessibilityCheck = {
  id: "p-as-heading",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "p") return;
      const role = getAttribute(node, "role");
      if ((role ? stringValueOf(role) : undefined) === "heading") return;
      if (
        !HEADING_CLASS.test(classNameTextOf(node)) &&
        !fontSizeLooksLikeHeading(node)
      ) {
        return;
      }

      findings.push({
        checkId: "p-as-heading",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "<p> is styled like a heading. Use an h1–h6 (or role=\"heading\" with aria-level) so the document outline matches the visual hierarchy.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

export const emptyThCheck: AccessibilityCheck = {
  id: "empty-th",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "th") return;
      if (isPropSpreadingHost(node)) return;
      if (hasAriaName(node, { includeTitle: false })) return;

      const element = jsxElementOf(node);
      if (element && hasTextContent(element)) return;
      if (!element && ts.isJsxOpeningElement(node)) return;

      findings.push({
        checkId: "empty-th",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          "<th> has no accessible name, so assistive technologies cannot announce the column or row header.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

function hasCaption(node: Parameters<typeof tagNameOf>[0]): boolean {
  if (hasAriaName(node)) return true;
  const element = jsxElementOf(node);
  if (!element) return false;
  return descendantTags(element).some((tag) => tagNameOf(tag) === "caption");
}

export const tableCaptionCheck: AccessibilityCheck = {
  id: "table-caption",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "table") return;
      if (isPropSpreadingHost(node)) return;
      if (isPresentationRole(node)) return;
      if (!isDataTable(node)) return;
      if (hasCaption(node)) return;

      findings.push({
        checkId: "table-caption",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          "Data table has no <caption> or accessible name, so users cannot tell what the table is about.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

function hasSummary(node: JsxTagNode): boolean {
  if (getAttribute(node, "summary")) return true;
  if (getAttribute(node, "aria-describedby")) return true;
  if (getAttribute(node, "aria-details")) return true;
  return false;
}

export const tableSummaryCheck: AccessibilityCheck = {
  id: "table-summary",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "table") return;
      if (isPropSpreadingHost(node)) return;
      if (isPresentationRole(node)) return;
      if (!isDataTable(node)) return;
      // The built-in complexity check now covers JSX-expression spans
      // (colSpan={4}) too — the shared definition, no per-check overrides.
      if (!isComplexDataTable(node)) return;
      if (hasSummary(node)) return;

      findings.push({
        checkId: "table-summary",
        kind: "violation",
        severity: "serious",
        confidence: "medium",
        reason:
          "Complex data table has no summary, aria-describedby, or aria-details, so users may not understand the table structure before reading cells.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

const DATA_TABLE_TAGS = new Set(["th", "caption"]);
const DATA_TABLE_ATTRS = ["headers", "scope"];

function hasDataTableMarkup(node: Parameters<typeof tagNameOf>[0]): boolean {
  const element = jsxElementOf(node);
  if (!element) return false;
  return descendantTags(element).some((tag) => {
    if (DATA_TABLE_TAGS.has(tagNameOf(tag))) return true;
    return DATA_TABLE_ATTRS.some((name) => getAttribute(tag, name) !== undefined);
  });
}

export const layoutTableMarkupCheck: AccessibilityCheck = {
  id: "layout-table-markup",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "table") return;
      if (isPropSpreadingHost(node)) return;
      if (!isPresentationRole(node)) return;
      if (!hasDataTableMarkup(node)) return;

      findings.push({
        checkId: "layout-table-markup",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          "Layout table (role=\"presentation\") still has header/caption markup, which assistive technologies treat as a data table.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

const IMAGE_TAGS = new Set(["img", "Image", "svg", "picture"]);

function hasImage(element: ts.JsxElement): boolean {
  return descendantTags(element).some((tag) => IMAGE_TAGS.has(tagNameOf(tag)));
}

function hasFigcaption(element: ts.JsxElement): boolean {
  return descendantTags(element).some((tag) => tagNameOf(tag) === "figcaption");
}

function hasUnassociatedCaption(element: ts.JsxElement): boolean {
  for (const child of element.children) {
    if (ts.isJsxText(child) && child.text.trim().length > 0) return true;
    if (ts.isJsxExpression(child) && child.expression) return true;
    const tag: Parameters<typeof tagNameOf>[0] | undefined = ts.isJsxSelfClosingElement(
      child,
    )
      ? child
      : ts.isJsxElement(child)
        ? child.openingElement
        : undefined;
    if (!tag) continue;
    const name = tagNameOf(tag);
    if (name === "figcaption" || IMAGE_TAGS.has(name)) continue;
    return true;
  }
  return false;
}

export const figureCaptionCheck: AccessibilityCheck = {
  id: "figure-caption",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "figure") return;
      if (isPropSpreadingHost(node)) return;
      const element = jsxElementOf(node);
      if (!element) return;
      if (!hasImage(element)) return;
      if (hasFigcaption(element)) return;
      if (!hasUnassociatedCaption(element)) return;

      findings.push({
        checkId: "figure-caption",
        kind: "violation",
        severity: "serious",
        confidence: "medium",
        reason:
          "<figure> has caption-like content that is not in a <figcaption>, so the association is not programmatically determinable.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

function hasCitationContent(element: ts.JsxElement): boolean {
  if (descendantTags(element).some((tag) => tagNameOf(tag) === "cite")) {
    return true;
  }
  const text = textContentOf(element).trim();
  return text.length > 0;
}

export const blockquoteCiteCheck: AccessibilityCheck = {
  id: "blockquote-cite",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node).toLowerCase() !== "blockquote") return;
      const cite = getAttribute(node, "cite");
      if (!cite) return;
      const element = jsxElementOf(node);
      if (element && hasCitationContent(element)) return;

      findings.push({
        checkId: "blockquote-cite",
        kind: "violation",
        severity: "moderate",
        confidence: "high",
        reason:
          "<blockquote cite> points at a source but exposes no citation text for assistive technologies (WCAG 1.3.1).",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

export const duplicateIdCheck: AccessibilityCheck = {
  id: "duplicate-id",
  run(source) {
    const byId = new Map<string, ReturnType<typeof locationOf>[]>();
    visitJsxTags(source.sourceFile, (node) => {
      const attr = getAttribute(node, "id");
      if (!attr) return;
      const value = stringValueOf(attr);
      if (!value?.trim()) return;
      const list = byId.get(value) ?? [];
      list.push(locationOf(source, node));
      byId.set(value, list);
    });

    const findings: RawFinding[] = [];
    for (const [id, locations] of byId) {
      if (locations.length < 2) continue;
      // Report each duplicate occurrence after the first.
      for (const location of locations.slice(1)) {
        findings.push({
          checkId: "duplicate-id",
          kind: "violation",
          severity: "serious",
          confidence: "high",
          reason: `Duplicate id="${id}" in this file; IDs must be unique for labels, ARIA references, and fragment links.`,
          location,
          fix: null,
        });
      }
    }
    return findings;
  },
};

const IMAGE_HOSTS = new Set([
  "img",
  "Image",
  "area",
  "svg",
  "canvas",
  "object",
  "embed",
]);

function stringAttribute(node: JsxTagNode, name: string): string | undefined {
  const attribute = getAttribute(node, name);
  return attribute ? stringValueOf(attribute) : undefined;
}

function altText(node: JsxTagNode): string | undefined {
  const alt = getAttribute(node, "alt");
  return alt ? stringValueOf(alt) : undefined;
}

function isMarkedDecorative(node: JsxTagNode): boolean {
  if (isDecorativeOrHidden(node)) return true;
  const alt = altText(node);
  return alt !== undefined && alt.length === 0;
}

function exposesAccessibleName(node: JsxTagNode): boolean {
  const alt = altText(node);
  if (alt !== undefined && alt.trim().length > 0) return true;
  return hasAriaName(node);
}

function isImageHost(node: JsxTagNode): boolean {
  const tag = tagNameOf(node);
  if (IMAGE_HOSTS.has(tag)) return true;
  if (tag === "input" && stringAttribute(node, "type") === "image") return true;
  return false;
}

export const decorativeIgnoredCheck: AccessibilityCheck = {
  id: "decorative-ignored",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!isImageHost(node)) return;

      const decorative = isMarkedDecorative(node);
      const named = exposesAccessibleName(node);

      if (isPresentationRole(node) && named) {
        findings.push({
          checkId: "decorative-ignored",
          kind: "violation",
          severity: "moderate",
          confidence: "high",
          reason:
            'A decorative image uses role="presentation" or role="none" but still exposes an accessible name (alt, aria-label, or title), so assistive technologies may announce it.',
          location: locationOf(source, node),
          fix: null,
        });
        return;
      }

      if (decorative && hasAriaName(node, { includeTitle: true })) {
        findings.push({
          checkId: "decorative-ignored",
          kind: "violation",
          severity: "moderate",
          confidence: "high",
          reason:
            "A decorative image is marked with an empty alt or aria-hidden but still has aria-label or title, so it may be announced.",
          location: locationOf(source, node),
          fix: null,
        });
        return;
      }

      const alt = altText(node);
      if (alt !== undefined && alt.length > 0 && /^\s+$/.test(alt)) {
        findings.push({
          checkId: "decorative-ignored",
          kind: "violation",
          severity: "moderate",
          confidence: "high",
          reason:
            'Whitespace-only alt text is not equivalent to alt=""; assistive technologies may still treat the image as informative.',
          location: locationOf(source, node),
          fix: null,
        });
      }
    });
    return findings;
  },
};
