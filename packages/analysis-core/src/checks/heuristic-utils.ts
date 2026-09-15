import ts from "typescript";

import {
  getAttribute,
  hasAnyAttr,
  jsxElementOf,
  type JsxTagNode,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

/**
 * BLAST RADIUS: this module is imported by ~14 checks (descendantTags,
 * textContentOf, handlerTriggersContextChange, style/ARIA string heuristics).
 * Any change here silently alters every dependent check — run the full
 * `packages/analysis-core/src/checks/` suite and do not extract, rename, or
 * split helpers without a dedicated design task.
 */

/** React keyboard event handler prop names. */
export const KEY_HANDLERS = ["onKeyDown", "onKeyUp", "onKeyPress"] as const;

export function hasKeyboardHandlers(node: JsxTagNode): boolean {
  return hasAnyAttr(node, [...KEY_HANDLERS]);
}

const MOTION_EVENTS = new Set([
  "deviceorientation",
  "deviceorientationabsolute",
  "devicemotion",
]);

export function walkMotionActuationCalls(
  sourceFile: ts.SourceFile,
  emit: (node: ts.CallExpression) => void,
): void {
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.getText() === "addEventListener" &&
      node.arguments.length > 0
    ) {
      const first = node.arguments[0];
      if (ts.isStringLiteral(first) && MOTION_EVENTS.has(first.text)) {
        emit(node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

const MEDIA_TRACK_TAGS = new Set(["track"]);

/** Track `kind` values that count as captions/subtitles. */
export const CAPTION_KINDS = new Set(["captions", "subtitles"]);

/** Track `kind` values that count as audio description. */
export const DESCRIPTION_KINDS = new Set(["descriptions"]);

/** Track `kind` values for audio alternative text. */
export const AUDIO_ALT_KINDS = new Set([
  "captions",
  "subtitles",
  "descriptions",
]);

/** Opening or self-closing tag for a JSX child node, if any. */
export function tagNodeOfJsxChild(child: ts.Node): JsxTagNode | undefined {
  if (ts.isJsxElement(child)) return child.openingElement;
  if (ts.isJsxSelfClosingElement(child)) return child;
  return undefined;
}

export function hasChildTrackKind(
  node: JsxTagNode,
  kinds: ReadonlySet<string>,
): boolean {
  const element = jsxElementOf(node);
  if (!element) return false;
  for (const child of element.children) {
    const tag = tagNodeOfJsxChild(child);
    if (!tag || !MEDIA_TRACK_TAGS.has(tagNameOf(tag))) continue;
    const kind = getAttribute(tag, "kind");
    const value = kind ? stringValueOf(kind)?.toLowerCase() : undefined;
    if (value && kinds.has(value)) return true;
  }
  return false;
}

const SPACING_STYLE_PROPS = new Set([
  "letterSpacing",
  "lineHeight",
  "wordSpacing",
  "paragraphSpacing",
]);

/** True when an inline style locks text spacing with `!important`. */
export function styleLocksTextSpacing(node: JsxTagNode): boolean {
  const style = getAttribute(node, "style");
  if (!style || !style.initializer || !ts.isJsxExpression(style.initializer)) {
    return false;
  }
  const expression = style.initializer.expression;
  if (!expression || !ts.isObjectLiteralExpression(expression)) return false;
  return expression.properties.some((prop) => {
    if (!ts.isPropertyAssignment(prop)) return false;
    if (!SPACING_STYLE_PROPS.has(prop.name.getText())) return false;
    const text = prop.initializer.getText();
    return /!important/i.test(text);
  });
}

export function classNameTextOf(node: JsxTagNode): string {
  const attr = getAttribute(node, "className") ?? getAttribute(node, "class");
  if (!attr) return "";
  const literal = stringValueOf(attr);
  if (literal !== undefined) return literal;
  return attr.initializer?.getText() ?? "";
}

/**
 * Tag name plus className/class and id attribute text — shared captcha-family
 * AST context. Callers append extra fields (e.g. aria-label) when needed.
 */
export function attributeContextOf(node: JsxTagNode): string {
  const id = getAttribute(node, "id");
  const idText = id ? (stringValueOf(id) ?? "") : "";
  return `${tagNameOf(node)} ${classNameTextOf(node)} ${idText}`;
}

export function textContentOf(element: ts.JsxElement): string {
  let text = "";
  const walk = (node: ts.Node): void => {
    if (ts.isJsxText(node)) text += node.text + " ";
    else ts.forEachChild(node, walk);
  };
  walk(element);
  return text;
}

/** Opening / self-closing JSX tags nested under an element (not the host). */
export function descendantTags(element: ts.JsxElement): JsxTagNode[] {
  const tags: JsxTagNode[] = [];
  const walk = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      tags.push(node);
    }
    ts.forEachChild(node, walk);
  };
  for (const child of element.children) walk(child);
  return tags;
}

/** True when a `<table>` contains any `<th>` descendant, i.e. it is a data table. */
export function isDataTable(node: JsxTagNode): boolean {
  const element = jsxElementOf(node);
  if (!element) return false;
  return descendantTags(element).some((tag) => tagNameOf(tag) === "th");
}

/** True when a data table likely needs a structural summary (RGAA 5.1). */
export function isComplexDataTable(tableNode: JsxTagNode): boolean {
  const element = jsxElementOf(tableNode);
  if (!element) return false;

  const tags = descendantTags(element);
  const spanExceedsOne = (node: JsxTagNode): boolean => {
    for (const name of ["colSpan", "colspan", "rowSpan", "rowspan"] as const) {
      const attr = getAttribute(node, name);
      if (!attr) continue;
      const value = stringValueOf(attr);
      if (value !== undefined) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed > 1) return true;
      }
      // <td colSpan={4}> — the value is a JSX expression, not a literal string.
      if (attr.initializer && ts.isJsxExpression(attr.initializer)) {
        const text = attr.initializer.expression?.getText() ?? "";
        const match = text.match(/\d+/);
        if (match !== null && Number.parseInt(match[0], 10) > 1) return true;
      }
    }
    return false;
  };

  let headerRows = 0;
  let dataRows = 0;
  let dataCols = 0;
  let hasHeadersAttr = false;
  let theadCount = 0;

  for (const tag of tags) {
    const name = tagNameOf(tag);
    if (name === "thead") theadCount += 1;
    if (name === "th") headerRows += 1;
    if (name === "td") dataRows += 1;
    if (getAttribute(tag, "headers")) hasHeadersAttr = true;
    if (spanExceedsOne(tag)) return true;
  }

  const rowTags = tags.filter((tag) => {
    const name = tagNameOf(tag);
    return name === "tr";
  });
  for (const row of rowTags) {
    const rowElement = jsxElementOf(row);
    if (!rowElement) continue;
    const cells = descendantTags(rowElement).filter((tag) => {
      const name = tagNameOf(tag);
      return name === "td" || name === "th";
    });
    dataCols = Math.max(dataCols, cells.length);
  }

  if (hasHeadersAttr) return true;
  if (theadCount > 1) return true;
  if (headerRows > 1 && dataRows > 0 && dataCols > 3 && rowTags.length > 3) {
    return true;
  }

  return false;
}

const NAMING_HOSTS = new Set(["button", "a", "label", "summary"]);

/** True when the node sits inside a control that typically names its graphic. */
export function isInsideNamingHost(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxElement(current)) {
      if (NAMING_HOSTS.has(tagNameOf(current.openingElement).toLowerCase())) {
        return true;
      }
    } else if (ts.isJsxSelfClosingElement(current)) {
      if (NAMING_HOSTS.has(tagNameOf(current).toLowerCase())) return true;
    }
    current = current.parent;
  }
  return false;
}

const TRANSCRIPT_PATTERN = /transcript|transcription|texte/i;
const TRANSCRIPT_LINK_HOSTS = new Set(["a", "button"]);

export type AdjacentSibling = {
  tag: JsxTagNode;
  /** Present when the sibling is a full element (`<a>…</a>`), not self-closing. */
  element: ts.JsxElement | undefined;
};

/**
 * Next non-whitespace sibling tag under the same parent element or fragment.
 * Skips empty JsxText; returns undefined when the next meaningful sibling is
 * not a JSX element/self-closing tag (e.g. an expression).
 */
export function nextMeaningfulSibling(
  node: JsxTagNode,
): AdjacentSibling | undefined {
  const self = ts.isJsxOpeningElement(node) ? node.parent : node;
  const parent = self.parent;
  if (!ts.isJsxElement(parent) && !ts.isJsxFragment(parent)) return undefined;
  const siblings = parent.children;
  const index = siblings.indexOf(self);
  if (index < 0) return undefined;

  for (let current = index + 1; current < siblings.length; current += 1) {
    const sibling = siblings[current];
    if (!sibling) continue;
    if (ts.isJsxText(sibling) && sibling.text.trim().length === 0) continue;
    const tag = tagNodeOfJsxChild(sibling);
    if (!tag) return undefined;
    return {
      tag,
      element: ts.isJsxElement(sibling) ? sibling : undefined,
    };
  }
  return undefined;
}

export function hasAdjacentTagMatching(
  node: JsxTagNode,
  predicate: (tag: JsxTagNode, element: ts.JsxElement | undefined) => boolean,
): boolean {
  const next = nextMeaningfulSibling(node);
  if (!next) return false;
  return predicate(next.tag, next.element);
}

export function hasAdjacentTranscriptLink(node: JsxTagNode): boolean {
  return hasAdjacentTagMatching(node, (siblingTag, siblingElement) => {
    if (!TRANSCRIPT_LINK_HOSTS.has(tagNameOf(siblingTag))) return false;
    if (!siblingElement) {
      const href = getAttribute(siblingTag, "href");
      const hrefValue = href ? stringValueOf(href) : undefined;
      return Boolean(hrefValue && TRANSCRIPT_PATTERN.test(hrefValue));
    }
    if (TRANSCRIPT_PATTERN.test(textContentOf(siblingElement))) return true;
    const href = getAttribute(siblingTag, "href");
    const hrefValue = href ? stringValueOf(href) : undefined;
    return Boolean(hrefValue && TRANSCRIPT_PATTERN.test(hrefValue));
  });
}

export function ariaDescribedByPointsToTranscript(
  node: JsxTagNode,
  sourceFile: ts.SourceFile,
): boolean {
  const describedBy = getAttribute(node, "aria-describedby");
  if (!describedBy) return false;
  const ids = (
    stringValueOf(describedBy) ??
    describedBy.initializer?.getText() ??
    ""
  )
    .split(/\s+/)
    .map((value) => value.replace(/['"]/g, ""))
    .filter(Boolean);
  if (ids.length === 0) return false;

  let found = false;
  const visit = (child: ts.Node): void => {
    if (
      ts.isJsxAttribute(child) &&
      ts.isIdentifier(child.name) &&
      child.name.text === "id" &&
      child.initializer
    ) {
      const idValue = stringValueOf(child);
      if (idValue && ids.includes(idValue)) {
        let host: ts.Node | undefined = child.parent;
        while (host && !ts.isJsxElement(host)) {
          host = host.parent;
        }
        if (
          host &&
          ts.isJsxElement(host) &&
          TRANSCRIPT_PATTERN.test(textContentOf(host))
        ) {
          found = true;
        }
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(sourceFile);
  return found;
}

/** True when the node has a matching track kind or an adjacent transcript alternative. */
export function hasTrackOrTranscriptAlt(
  node: JsxTagNode,
  kinds: ReadonlySet<string>,
  sourceFile: ts.SourceFile,
): boolean {
  if (hasChildTrackKind(node, kinds)) return true;
  if (hasAdjacentTranscriptLink(node)) return true;
  return ariaDescribedByPointsToTranscript(node, sourceFile);
}

/**
 * Shared AST check for `<video>` without an audio description. The two
 * criteria (strict descriptions track vs. descriptions-or-transcript) differ
 * only in whether an adjacent transcript is accepted — one factory, two checks.
 */
export function makeVideoDescriptionCheck(options: {
  id: "audio-description-track" | "audio-description-or-alt";
  reason: string;
  acceptTranscriptAlternative: boolean;
}): AccessibilityCheck {
  return {
    id: options.id,
    run(source) {
      const findings: RawFinding[] = [];
      visitJsxTags(source.sourceFile, (node) => {
        if (tagNameOf(node) !== "video") return;
        const satisfied = options.acceptTranscriptAlternative
          ? hasTrackOrTranscriptAlt(node, DESCRIPTION_KINDS, source.sourceFile)
          : hasChildTrackKind(node, DESCRIPTION_KINDS);
        if (satisfied) return;

        findings.push({
          checkId: options.id,
          kind: "warning",
          severity: "moderate",
          confidence: "low",
          reason: options.reason,
          location: locationOf(source, node),
          fix: null,
        });
      });
      return findings;
    },
  };
}
