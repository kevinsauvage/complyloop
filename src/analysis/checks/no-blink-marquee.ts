import ts from "typescript";
import { classNameTextOf } from "./heuristic-utils";
import {
  getAttribute,
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
const ANIMATION_STYLE_PROPS = new Set([
  "animation",
  "animationName",
  "animationDuration",
]);
const NONE_VALUES = new Set(["none", "unset", "initial", "inherit"]);

function styleHasCssAnimation(node: JsxTagNode): boolean {
  const style = getAttribute(node, "style");
  if (!style?.initializer) return false;

  const literal = stringValueOf(style);
  if (literal && /animation(?:-name|-duration)?\s*:/i.test(literal)) {
    return !/animation(?:-name)?\s*:\s*none\b/i.test(literal);
  }

  if (!ts.isJsxExpression(style.initializer)) return false;
  const expression = style.initializer.expression;
  if (!expression || !ts.isObjectLiteralExpression(expression)) return false;

  return expression.properties.some((prop) => {
    if (!ts.isPropertyAssignment(prop)) return false;
    if (!ANIMATION_STYLE_PROPS.has(prop.name.getText())) return false;
    const text = prop.initializer.getText().replace(/['"`]/g, "").trim();
    return text.length > 0 && !NONE_VALUES.has(text);
  });
}

function classNameSuggestsMotion(className: string): boolean {
  return /\banimate-(?!none(?:\b|\[))/i.test(className);
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

      const moving =
        styleHasCssAnimation(node) ||
        classNameSuggestsMotion(classNameTextOf(node)) ||
        isCarouselHost(node);
      if (!moving) return;

      findings.push({
        checkId: "no-blink-marquee",
        kind: "warning",
        severity: "moderate",
        confidence: "medium",
        reason:
          "Moving or auto-advancing content may lack a pause, stop, or hide control (RGAA 13.8 / WCAG 2.2.2). prefers-reduced-motion is not enough on its own.",
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
