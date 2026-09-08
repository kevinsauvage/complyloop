import ts from "typescript";
import { CAPTCHA_COMPONENT_HOSTS } from "../patterns/error-prevention-criteria.ts";
import {
  CAPTCHA_ALTERNATIVE,
  CAPTCHA_TOKEN,
  matchesMultilingual,
} from "../patterns/multilingual.ts";
import { descendantTags, textContentOf } from "./heuristic-utils.ts";
import {
  getAttribute,
  jsxElementOf,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse.ts";
import type { AccessibilityCheck, RawFinding } from "../types.ts";

const CAPTCHA_HOSTS = new Set<string>(CAPTCHA_COMPONENT_HOSTS);

function isCaptchaHost(node: JsxTagNode): boolean {
  const tag = tagNameOf(node);
  if (CAPTCHA_HOSTS.has(tag)) return true;
  const className =
    getAttribute(node, "className") ?? getAttribute(node, "class");
  const classText = className ? (stringValueOf(className) ?? "") : "";
  const id = getAttribute(node, "id");
  const idText = id ? (stringValueOf(id) ?? "") : "";
  return matchesMultilingual(CAPTCHA_TOKEN, `${tag} ${classText} ${idText}`);
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
      if (matchesMultilingual(CAPTCHA_ALTERNATIVE, controlLabel(tag))) return true;
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
    const tag = ts.isJsxElement(child)
      ? child.openingElement
      : ts.isJsxSelfClosingElement(child)
        ? child
        : undefined;
    if (!tag) continue;
    if (subtreeHasAlternative(tag)) return true;
    const tagName = tagNameOf(tag);
    if (tagName === "a" || tagName === "button") {
      if (matchesMultilingual(CAPTCHA_ALTERNATIVE, controlLabel(tag))) return true;
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
        kind: "violation",
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
