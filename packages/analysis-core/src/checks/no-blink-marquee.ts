import ts from "typescript";
import {
  classNameTextOf,
  descendantTags,
  textContentOf,
} from "./heuristic-utils";
import {
  booleanAttributeValue,
  getAttribute,
  jsxElementOf,
  locationOf,
  stringValueOf,
  tagNameOf,
  visitJsxTags,
  type JsxTagNode,
} from "../parse";
import type { AccessibilityCheck, RawFinding } from "../types";

const DISTRACTING = new Set(["marquee", "blink"]);
const CAROUSEL_TAGS = new Set([
  "Carousel",
  "Swiper",
  "EmblaCarousel",
  "Splide",
  "KeenSlider",
  "Flickity",
]);
const NONE_VALUES = new Set(["none", "unset", "initial", "inherit"]);
const INFINITE_TAILWIND =
  /\banimate-(?:spin|pulse|bounce|ping)(?:\b|\[|\/)/i;
const ENTRANCE_MOTION =
  /\banimate-(?:in|out)\b|\b(?:fade|slide|zoom)-(?:in|out)\b/i;
const PAUSE_LABEL = /\b(?:pause|stop|hide)\b/i;

function animationValueIsInfinite(value: string): boolean {
  const text = value.replace(/['"`]/g, "").trim().toLowerCase();
  if (!text || NONE_VALUES.has(text)) return false;
  return text === "infinite" || text.includes(" infinite");
}

function styleHasInfiniteAnimation(node: JsxTagNode): boolean {
  const style = getAttribute(node, "style");
  if (!style?.initializer) return false;

  const literal = stringValueOf(style);
  if (literal) {
    if (!/animation/i.test(literal)) return false;
    if (/animation(?:-name|-iteration-count)?\s*:\s*none\b/i.test(literal)) {
      return false;
    }
    return /\binfinite\b/i.test(literal);
  }

  if (!ts.isJsxExpression(style.initializer)) return false;
  const expression = style.initializer.expression;
  if (!expression || !ts.isObjectLiteralExpression(expression)) return false;

  let hasAnimationCue = false;
  let infinite = false;

  for (const prop of expression.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = prop.name.getText();
    const text = prop.initializer.getText().replace(/['"`]/g, "").trim().toLowerCase();

    if (name === "animation") {
      if (NONE_VALUES.has(text) || text === "none") continue;
      hasAnimationCue = true;
      if (animationValueIsInfinite(text)) infinite = true;
    }
    if (name === "animationName" && text.length > 0 && !NONE_VALUES.has(text)) {
      hasAnimationCue = true;
    }
    if (name === "animationIterationCount") {
      if (text === "infinite" || text === "infinity") infinite = true;
    }
  }

  return infinite && hasAnimationCue;
}

function classNameHasInfiniteMotion(className: string): boolean {
  if (!className) return false;
  if (ENTRANCE_MOTION.test(className)) return false;
  return INFINITE_TAILWIND.test(className);
}

function isCarouselHost(node: JsxTagNode): boolean {
  const tag = tagNameOf(node);
  if (CAROUSEL_TAGS.has(tag)) return true;

  const roleDescription = getAttribute(node, "aria-roledescription");
  const roleText = roleDescription
    ? (stringValueOf(roleDescription) ??
      roleDescription.initializer?.getText() ??
      "")
    : "";
  if (/carousel/i.test(roleText)) return true;

  return /\b(carousel|swiper)\b/i.test(classNameTextOf(node));
}

function autoplayState(node: JsxTagNode): "true" | "false" | "unknown" {
  const attr =
    getAttribute(node, "autoplay") ?? getAttribute(node, "autoPlay");
  if (!attr) return "unknown";
  const value = booleanAttributeValue(attr);
  if (value === true) return "true";
  if (value === false) return "false";
  return "unknown";
}

function autoplayDisabled(node: JsxTagNode): boolean {
  return autoplayState(node) === "false";
}

function hasPauseControlAttr(node: JsxTagNode): boolean {
  for (const name of [
    "pause",
    "paused",
    "showPauseButton",
    "pauseButton",
    "withPauseButton",
  ]) {
    const attr = getAttribute(node, name);
    if (booleanAttributeValue(attr) === true) return true;
  }
  return false;
}

function accessibleNameOfTag(tag: JsxTagNode): string {
  const ariaLabel = getAttribute(tag, "aria-label");
  if (ariaLabel) {
    const value = stringValueOf(ariaLabel);
    if (value) return value;
  }
  const title = getAttribute(tag, "title");
  if (title) {
    const value = stringValueOf(title);
    if (value) return value;
  }
  return "";
}

function subtreeHasPauseControl(node: JsxTagNode): boolean {
  const element = jsxElementOf(node);
  if (!element) return false;

  for (const tag of descendantTags(element)) {
    const tagName = tagNameOf(tag);
    const roleAttr = getAttribute(tag, "role");
    const role = roleAttr ? stringValueOf(roleAttr) : undefined;
    const isButton =
      tagName === "button" ||
      role === "button" ||
      getAttribute(tag, "type")?.initializer?.getText() === '"button"';

    if (!isButton) continue;

    const childElement = jsxElementOf(tag);
    const label = [
      accessibleNameOfTag(tag),
      childElement ? textContentOf(childElement) : "",
    ].join(" ");
    if (PAUSE_LABEL.test(label)) return true;
  }

  return false;
}

function hasAnimationPauseControl(node: JsxTagNode): boolean {
  return hasPauseControlAttr(node) || subtreeHasPauseControl(node);
}

function carouselLikelyAutoAdvances(node: JsxTagNode): boolean {
  if (!isCarouselHost(node)) return false;
  if (autoplayDisabled(node) || hasAnimationPauseControl(node)) return false;

  const autoplay = autoplayState(node);
  if (autoplay === "true") return true;

  const interval = getAttribute(node, "interval");
  if (interval) {
    const intervalText = stringValueOf(interval);
    if (intervalText === "0") return false;
    if (intervalText !== undefined || booleanAttributeValue(interval) !== false) {
      return true;
    }
  }

  return autoplay === "unknown";
}

function shouldWarnAboutMotion(node: JsxTagNode): boolean {
  const cssMotion =
    styleHasInfiniteAnimation(node) ||
    classNameHasInfiniteMotion(classNameTextOf(node));

  if (cssMotion && !hasAnimationPauseControl(node)) return true;
  if (carouselLikelyAutoAdvances(node)) return true;
  return false;
}

export const noBlinkMarqueeCheck: AccessibilityCheck = {
  id: "no-blink-marquee",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node) => {
      const tag = tagNameOf(node);
      if (DISTRACTING.has(tag)) {
        findings.push({
          checkId: "no-blink-marquee",
          kind: "violation",
          severity: "serious",
          confidence: "high",
          reason: `<${tag}> moves or flashes content without a user-controlled pause, which can disorient users and trigger seizures.`,
          location: locationOf(source, node),
          fix: null,
        });
        return;
      }

      if (!shouldWarnAboutMotion(node)) return;

      findings.push({
        checkId: "no-blink-marquee",
        kind: "warning",
        severity: "moderate",
        confidence: "medium",
        reason:
          "Auto-moving content may lack a pause, stop, or hide control (RGAA 13.8 / WCAG 2.2.2). prefers-reduced-motion is not enough on its own.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
