import ts from "typescript";
import { hasAriaName, isPropSpreadingHost } from "../../jsx-primitives.ts";
import {
  VAGUE_LINK_PREFIX,
  VAGUE_LINK_TEXT,
  foldAccents,
} from "../../patterns/multilingual.ts";
import {
  booleanAttributeValue,
  getAttribute,
  hasTextContent,
  jsxElementOf,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxElements,
  visitJsxTags,
  type JsxTagNode,
} from "../../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../../types.ts";
import {
  descendantTags,
  styleLocksTextSpacing,
  textContentOf,
} from "../heuristic-utils.ts";
import { collectJsxTexts, hasAttrOnAncestors } from "../jsx-text-walk.ts";

function isLiveRegion(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): boolean {
  const role = getAttribute(node, "role");
  const roleValue = role ? stringValueOf(role)?.toLowerCase() : undefined;
  if (roleValue === "status" || roleValue === "alert") return true;
  return getAttribute(node, "aria-live") !== undefined;
}

function describedByIsLive(
  sourceFile: ts.SourceFile,
  describedBy: string,
): boolean {
  const ids = describedBy.split(/\s+/).filter(Boolean);
  for (const id of ids) {
    const found = findElementById(sourceFile, id);
    if (!found) continue;
    if (isLiveRegion(found)) return true;
  }
  return false;
}

function findElementById(
  sourceFile: ts.SourceFile,
  id: string,
): ts.JsxOpeningElement | ts.JsxSelfClosingElement | undefined {
  let match: ts.JsxOpeningElement | ts.JsxSelfClosingElement | undefined;
  visitJsxTags(sourceFile, (node) => {
    if (match) return;
    const idAttr = getAttribute(node, "id");
    if (idAttr && stringValueOf(idAttr) === id) match = node;
  });
  return match;
}

function siblingsIncludeLiveRegion(node: JsxTagNode): boolean {
  let parent: ts.Node | undefined = node.parent;
  while (parent) {
    if (ts.isJsxElement(parent)) {
      for (const child of parent.children) {
        const tag: ts.JsxOpeningElement | ts.JsxSelfClosingElement | undefined =
          ts.isJsxElement(child)
            ? child.openingElement
            : ts.isJsxSelfClosingElement(child)
              ? child
              : undefined;
        if (tag && tag !== node && isLiveRegion(tag)) return true;
      }
      return false;
    }
    parent = parent.parent;
  }
  return false;
}

function isInvalidField(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): boolean {
  const invalid = getAttribute(node, "aria-invalid");
  if (!invalid) return false;
  const value = booleanAttributeValue(invalid);
  return value === true || stringValueOf(invalid)?.toLowerCase() === "true";
}

export const statusLiveCheck: AccessibilityCheck = {
  id: "status-live",
  run(source) {
    const findings: RawFinding[] = [];

    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (tag === "Toaster" || tag === "Sonner") {
        const role = getAttribute(node, "role");
        const live = getAttribute(node, "aria-live");
        if (!role && !live) {
          findings.push({
            checkId: "status-live",
            kind: "warning",
            severity: "moderate",
            confidence: "low",
            reason: `${tag} renders status messages without aria-live or role="status"/"alert" on the host (WCAG 4.1.3).`,
            location: locationOf(source, node),
            fix: null,
          });
        }
      }
    });

    visitJsxTags(source.sourceFile, (node) => {
      if (!isInvalidField(node)) return;
      const describedBy = getAttribute(node, "aria-describedby");
      const describedValue = describedBy ? stringValueOf(describedBy) : undefined;
      if (describedValue && describedByIsLive(source.sourceFile, describedValue)) {
        return;
      }
      const element = jsxElementOf(node);
      if (element && descendantTags(element).some((tag) => isLiveRegion(tag))) {
        return;
      }
      if (siblingsIncludeLiveRegion(node)) {
        return;
      }

      findings.push({
        checkId: "status-live",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "Invalid field exposes validation feedback without a live region (role=\"status\", role=\"alert\", or aria-live) so screen readers announce the error (WCAG 4.1.3).",
        location: locationOf(source, node),
        fix: null,
      });
    });

    return findings;
  },
};

const NEW_WINDOW_WARNING = /new (window|tab)|nouvelle fen[êe]tre|nouvel onglet/i;

function isEmptyDepsArray(node: ts.Expression | undefined): boolean {
  return (
    node !== undefined &&
    ts.isArrayLiteralExpression(node) &&
    node.elements.length === 0
  );
}

function bodyContainsWindowOpen(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(child) &&
      child.expression.getText() === "window" &&
      child.name.getText() === "open"
    ) {
      found = true;
      return;
    }
    if (ts.isIdentifier(child) && child.getText() === "window.open") {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function isMountUseEffect(call: ts.CallExpression): boolean {
  if (!ts.isIdentifier(call.expression) || call.expression.text !== "useEffect") {
    return false;
  }
  if (call.arguments.length < 2) return false;
  const effectFn = call.arguments[0];
  if (!effectFn || !bodyContainsWindowOpen(effectFn)) return false;
  return isEmptyDepsArray(call.arguments[1]);
}

export const newWindowOnloadCheck: AccessibilityCheck = {
  id: "new-window-onload",
  run(source) {
    const findings: RawFinding[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        if (isMountUseEffect(node)) {
          findings.push({
            checkId: "new-window-onload",
            kind: "violation",
            severity: "serious",
            confidence: "medium",
            reason:
              "useEffect on mount calls window.open, which opens an unsolicited new window without user action (RGAA 13.2).",
            location: locationOf(source, node),
            fix: null,
          });
        } else if (
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.expression.getText() === "window" &&
          node.expression.name.getText() === "open" &&
          !ts.isCallExpression(node.parent)
        ) {
          let inHandler = false;
          let current: ts.Node | undefined = node.parent;
          while (current) {
            if (
              ts.isArrowFunction(current) ||
              ts.isFunctionExpression(current) ||
              ts.isMethodDeclaration(current)
            ) {
              inHandler = true;
              break;
            }
            current = current.parent;
          }
          if (!inHandler) {
            findings.push({
              checkId: "new-window-onload",
              kind: "violation",
              severity: "serious",
              confidence: "medium",
              reason:
                "window.open runs outside an explicit user handler and may open an unsolicited window (RGAA 13.2).",
              location: locationOf(source, node),
              fix: null,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source.sourceFile);

    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (tag !== "a" && tag !== "Link") return;
      const target = getAttribute(node, "target");
      const targetValue = target ? stringValueOf(target) : undefined;
      if (targetValue !== "_blank") return;
      if (getAttribute(node, "aria-describedby")) return;
      const element = jsxElementOf(node);
      const text = element ? textContentOf(element) : "";
      if (NEW_WINDOW_WARNING.test(text)) return;

      findings.push({
        checkId: "new-window-onload",
        kind: "warning",
        severity: "moderate",
        confidence: "medium",
        reason:
          'Link opens a new window (target="_blank") without warning users in the link text or aria-describedby (RGAA 13.2).',
        location: locationOf(source, node),
        fix: null,
      });
    });

    return findings;
  },
};

const RTL_CHAR = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F]/;
const LTR_CHAR = /[A-Za-z]/;

function textHasRtl(text: string): boolean {
  return RTL_CHAR.test(text);
}

function textHasLtr(text: string): boolean {
  return LTR_CHAR.test(text);
}

export const dirChangeCheck: AccessibilityCheck = {
  id: "dir-change",
  run(source) {
    const texts = collectJsxTexts(source.sourceFile, { minLength: 1 }).map(
      (entry) => ({
        node: entry.node,
        hasRtl: textHasRtl(entry.text),
        hasLtr: textHasLtr(entry.text),
      }),
    );
    const fileHasRtl = texts.some((entry) => entry.hasRtl);
    const fileHasLtr = texts.some((entry) => entry.hasLtr);
    if (!fileHasRtl || !fileHasLtr) return [];

    const findings: RawFinding[] = [];
    for (const entry of texts) {
      if (!entry.hasRtl || hasAttrOnAncestors(entry.node, "dir")) continue;
      findings.push({
        checkId: "dir-change",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "Right-to-left text appears in a mixed-direction file without a dir attribute on the containing element (WCAG 1.3.2).",
        location: locationOf(source, entry.node),
        fix: null,
      });
    }

    visitJsxTags(source.sourceFile, (node: JsxTagNode) => {
      const dir = getAttribute(node, "dir");
      if (!dir) return;
      const value = dir.initializer?.getText().replace(/['"]/g, "") ?? "";
      if (value !== "rtl" && value !== "ltr") return;
      const parent = node.parent;
      if (!parent || !ts.isJsxElement(parent)) return;
      const siblings = parent.children.filter(ts.isJsxText);
      const siblingMix =
        siblings.some((s) => textHasRtl(s.text)) &&
        siblings.some((s) => textHasLtr(s.text));
      if (!siblingMix) return;
      if (hasAttrOnAncestors(node, "dir")) return;
      findings.push({
        checkId: "dir-change",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason: `<${tagNameOf(node)}> sets dir="${value}" but mixed-direction siblings lack an explicit text direction (WCAG 1.3.2).`,
        location: locationOf(source, node),
        fix: null,
      });
    });

    return findings;
  },
};

const LATIN_EXTENDED = /[À-ÿ]/;
const CYRILLIC = /[\u0400-\u04FF]/;
const ARABIC = /[\u0600-\u06FF]/;
const CJK = /[\u3040-\u30FF\u4E00-\u9FFF]/;

function pageLang(sourceFile: ts.SourceFile): string | undefined {
  let lang: string | undefined;
  visitJsxTags(sourceFile, (node) => {
    if (lang !== undefined) return;
    if (tagNameOf(node) !== "html") return;
    const attribute = getAttribute(node, "lang");
    if (!attribute) return;
    lang = stringValueOf(attribute)?.toLowerCase();
  });
  return lang;
}

function needsLangForScript(text: string, pageDefault: string | undefined): boolean {
  const defaultLang = pageDefault?.split("-")[0] ?? "en";
  if (defaultLang === "fr" || defaultLang === "en" || defaultLang === "de") {
    if (CYRILLIC.test(text) || ARABIC.test(text) || CJK.test(text)) return true;
  }
  if ((defaultLang === "en" || defaultLang === undefined) && LATIN_EXTENDED.test(text)) {
    return true;
  }
  if (defaultLang === "en" && CYRILLIC.test(text)) return true;
  return false;
}

export const langChangeCheck: AccessibilityCheck = {
  id: "lang-change",
  run(source) {
    const defaultLang = pageLang(source.sourceFile);
    if (!defaultLang) return [];
    const findings: RawFinding[] = [];

    for (const entry of collectJsxTexts(source.sourceFile, { minLength: 4 })) {
      if (!needsLangForScript(entry.text, defaultLang)) continue;
      if (hasAttrOnAncestors(entry.node, "lang", { stopAtHtml: true })) continue;
      findings.push({
        checkId: "lang-change",
        kind: "warning",
        severity: "moderate",
        confidence: "medium",
        reason:
          "Text appears to use a different language or script than the page default but has no lang attribute on a containing element (WCAG 3.1.2 / RGAA 8.7).",
        location: locationOf(source, entry.node),
        fix: null,
      });
    }

    return findings;
  },
};

/** WCAG 1.4.4 — viewport must not prevent zooming/scaling. */
function viewportBlocksZoom(content: string): boolean {
  const normalized = content.toLowerCase().replace(/\s+/g, "");
  if (
    normalized.includes("user-scalable=no") ||
    normalized.includes("user-scalable=0") ||
    normalized.includes("user-scalable=false")
  ) {
    return true;
  }
  const maxScale = normalized.match(/maximum-scale=([0-9.]+)/);
  if (maxScale) {
    const value = Number.parseFloat(maxScale[1] ?? "");
    if (Number.isFinite(value) && value < 2) return true;
  }
  return false;
}

export const metaViewportCheck: AccessibilityCheck = {
  id: "meta-viewport",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (tagNameOf(node) !== "meta") return;
      const nameAttr = getAttribute(node, "name");
      const name = nameAttr ? stringValueOf(nameAttr) : undefined;
      if (name?.toLowerCase() !== "viewport") return;

      const contentAttr = getAttribute(node, "content");
      const content = contentAttr ? stringValueOf(contentAttr) : undefined;
      if (content === undefined) return;
      if (!viewportBlocksZoom(content)) return;

      findings.push({
        checkId: "meta-viewport",
        kind: "violation",
        severity: "serious",
        confidence: "high",
        reason:
          'Viewport meta disables zoom (user-scalable=no or maximum-scale < 2), which blocks users who need to enlarge text.',
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

export const textSpacingCheck: AccessibilityCheck = {
  id: "text-spacing",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!styleLocksTextSpacing(node)) return;

      findings.push({
        checkId: "text-spacing",
        kind: "violation",
        severity: "moderate",
        confidence: "high",
        reason:
          "Inline letter-spacing, line-height, word-spacing, or paragraph-spacing uses !important, so users cannot override spacing to read the text.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

const COLOR_PROPS = new Set(["color", "backgroundColor", "background"]);

function styleSetsOnlyOneSide(node: Parameters<typeof getAttribute>[0]): boolean {
  const style = getAttribute(node, "style");
  if (!style?.initializer || !ts.isJsxExpression(style.initializer)) {
    return false;
  }
  const expression = style.initializer.expression;
  if (!expression || !ts.isObjectLiteralExpression(expression)) return false;

  let hasColor = false;
  let hasBackground = false;
  for (const prop of expression.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = prop.name.getText();
    if (name === "color") hasColor = true;
    if (COLOR_PROPS.has(name) && name !== "color") hasBackground = true;
  }
  return (hasColor && !hasBackground) || (hasBackground && !hasColor);
}

export const bothColorsCheck: AccessibilityCheck = {
  id: "both-colors",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      if (!styleSetsOnlyOneSide(node)) return;
      findings.push({
        checkId: "both-colors",
        kind: "warning",
        severity: "moderate",
        confidence: "medium",
        reason:
          "Inline style sets color or background without the paired value, which breaks user stylesheets (WCAG 1.4.3 / RGAA 10.5).",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

const ASCII_ART_LINE =
  /^[\s|/\\_\-=+*#@<>[\]().,'"`~:;{}[\]\\]{5,}$/;
const EMOTICON_ONLY = /^(\s*(:-?\)|:-?\(|;-?\)|:-?D|:\||:-?P|<3|xD)\s*)+$/i;

function isAsciiArtBlock(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return false;
  const artLines = lines.filter((line) => ASCII_ART_LINE.test(line));
  return artLines.length >= 2;
}

function hasAccessibleAlternative(node: JsxTagNode): boolean {
  if (hasAriaName(node)) return true;
  return getAttribute(node, "aria-describedby") !== undefined;
}

function jsxHostOf(node: ts.Node): JsxTagNode | undefined {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isJsxOpeningElement(current) || ts.isJsxSelfClosingElement(current)) {
      return current;
    }
    if (ts.isJsxElement(current)) return current.openingElement;
    current = current.parent;
  }
  return undefined;
}

export const crypticContentAltCheck: AccessibilityCheck = {
  id: "cryptic-content-alt",
  run(source) {
    const findings: RawFinding[] = [];

    visitJsxElements(source.sourceFile, (element) => {
      if (tagNameOf(element.openingElement) !== "pre") return;
      const text = textContentOf(element).trim();
      if (!isAsciiArtBlock(text)) return;
      if (hasAccessibleAlternative(element.openingElement)) return;

      findings.push({
        checkId: "cryptic-content-alt",
        kind: "violation",
        severity: "moderate",
        confidence: "medium",
        reason:
          "ASCII art in <pre> has no accessible alternative (aria-label, aria-labelledby, or aria-describedby) (WCAG 1.1.1 / RGAA 13.5).",
        location: locationOf(source, element.openingElement),
        fix: null,
      });
    });

    const visitText = (node: ts.Node): void => {
      if (!ts.isJsxText(node)) {
        ts.forEachChild(node, visitText);
        return;
      }
      const trimmed = node.text.trim();
      if (trimmed.length === 0 || !EMOTICON_ONLY.test(trimmed)) {
        ts.forEachChild(node, visitText);
        return;
      }
      const host = jsxHostOf(node);
      if (!host || hasAccessibleAlternative(host)) {
        ts.forEachChild(node, visitText);
        return;
      }
      findings.push({
        checkId: "cryptic-content-alt",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "Emoticon-only text may need a text alternative for screen reader users (WCAG 1.1.1 / RGAA 13.5).",
        location: locationOf(source, node),
        fix: null,
      });
      ts.forEachChild(node, visitText);
    };
    visitText(source.sourceFile);

    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (tag !== "span" && tag !== "p") return;
      const element = ts.isJsxOpeningElement(node) ? node.parent : null;
      if (!element || !ts.isJsxElement(element)) return;
      const text = textContentOf(element).trim();
      if (!EMOTICON_ONLY.test(text) || hasAccessibleAlternative(node)) return;
      findings.push({
        checkId: "cryptic-content-alt",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason:
          "Emoticon-only content may need an accessible name or description (WCAG 1.1.1 / RGAA 13.5).",
        location: locationOf(source, node),
        fix: null,
      });
    });

    return findings;
  },
};

function accessibleLinkText(node: JsxTagNode): string {
  const element = jsxElementOf(node);
  if (!element) return "";
  return textContentOf(element).trim();
}

export const linkExplicitHeuristicCheck: AccessibilityCheck = {
  id: "link-explicit-heuristic",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (tag !== "a" && tag !== "Link") return;
      if (isPropSpreadingHost(node)) return;
      const element = jsxElementOf(node);
      if (!element || !hasTextContent(element)) return;

      const text = accessibleLinkText(node);
      const normalized = foldAccents(text);
      if (
        !VAGUE_LINK_TEXT.test(text) &&
        !VAGUE_LINK_TEXT.test(normalized) &&
        !VAGUE_LINK_PREFIX.test(text) &&
        !VAGUE_LINK_PREFIX.test(normalized)
      ) {
        return;
      }

      findings.push({
        checkId: "link-explicit-heuristic",
        kind: "warning",
        severity: "moderate",
        confidence: "medium",
        reason: `Link text "${text}" may not be explicit out of context (RGAA 6.1).`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
