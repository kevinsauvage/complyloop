import ts from "typescript";

import { isDecorativeOrHidden, isDomHost } from "../../a11y-aria.ts";
import { isNativeInteractive } from "../../a11y-model.ts";
import { isPropSpreadingHost } from "../../jsx-primitives.ts";
import {
  booleanAttributeValue,
  getAttribute,
  hasAnyAttr,
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
  hasKeyboardHandlers,
  textContentOf,
  walkMotionActuationCalls,
} from "../heuristic-utils.ts";

export const motionActuationCheck: AccessibilityCheck = {
  id: "motion-actuation",
  run(source) {
    const findings: RawFinding[] = [];
    walkMotionActuationCalls(source.sourceFile, (call) => {
      findings.push({
        checkId: "motion-actuation",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason: "Uses a device motion or orientation sensor (deviceorientation/devicemotion). Provide a non-motion alternative (button or keyboard) so users who cannot perform the motion can still act (WCAG 2.5.4).",
        location: locationOf(source, call),
        fix: null,
      });
    });
    return findings;
  },
};

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
    if (booleanAttributeValue(attr)) return true;
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

const REFRESH_KEYWORDS = [
  "location",
  "router.push",
  "router.replace",
  "navigate(",
  "window.location",
  "href =",
  "history.push",
  "history.replace",
];

function isTimerCallee(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) {
    return expression.text === "setTimeout" || expression.text === "setInterval";
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const name = expression.name.text;
    return name === "setTimeout" || name === "setInterval";
  }
  return false;
}

function callbackMayRefresh(callback: ts.Expression | undefined): boolean {
  if (!callback) return false;
  const text = callback.getText();
  return REFRESH_KEYWORDS.some((keyword) => text.includes(keyword));
}

export const noAutoRefreshCheck: AccessibilityCheck = {
  id: "no-auto-refresh",
  run(source) {
    const findings: RawFinding[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && isTimerCallee(node.expression)) {
        const callback = node.arguments[0];
        if (callbackMayRefresh(callback)) {
          findings.push({
            checkId: "no-auto-refresh",
            kind: "warning",
            severity: "moderate",
            confidence: "medium",
            reason:
              "A timer may refresh or navigate the page automatically; users may not control the time limit (RGAA 13.1).",
            location: locationOf(source, node),
            fix: null,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source.sourceFile);
    return findings;
  },
};

const DRAG_HANDLERS = ["onDrag", "onDragStart", "onDragEnd", "onDrop"];

export const draggingCheck: AccessibilityCheck = {
  id: "dragging",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node: JsxTagNode) => {
      if (!isDomHost(tagNameOf(node))) return;
      if (isPropSpreadingHost(node)) return;
      if (isDecorativeOrHidden(node)) return;

      const draggable = getAttribute(node, "draggable");
      const isDraggable =
        draggable !== undefined &&
        (booleanAttributeValue(draggable) === true ||
          stringValueIsTrue(draggable));
      const hasDragHandler = hasAnyAttr(node, DRAG_HANDLERS);
      if (!isDraggable && !hasDragHandler) return;
      if (isNativeInteractive(node)) return;
      if (hasKeyboardHandlers(node)) return;

      findings.push({
        checkId: "dragging",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason: `<${tagNameOf(node)}> supports drag-and-drop without a keyboard alternative (onKeyDown). Provide buttons or inputs for single-pointer users (WCAG 2.5.7).`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

function stringValueIsTrue(attr: NonNullable<ReturnType<typeof getAttribute>>): boolean {
  const text = attr.initializer?.getText().replace(/['"]/g, "");
  return text === "true";
}

export const pointerCancellationCheck: AccessibilityCheck = {
  id: "pointer-cancellation",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node: JsxTagNode) => {
      if (!isDomHost(tagNameOf(node))) return;
      if (isPropSpreadingHost(node)) return;
      if (isDecorativeOrHidden(node)) return;
      if (!hasAnyAttr(node, ["onPointerDown", "onMouseDown"])) return;
      if (hasAnyAttr(node, ["onPointerUp", "onPointerCancel", "onMouseUp"])) {
        return;
      }
      findings.push({
        checkId: "pointer-cancellation",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason: `<${tagNameOf(node)}> starts a pointer action (pointerdown/mousedown) without a pointerup/pointercancel counterpart, so the action may not be abortable by moving the pointer away (WCAG 2.5.2).`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};

export const pointerGestureCheck: AccessibilityCheck = {
  id: "pointer-gesture",
  run(source) {
    const findings: RawFinding[] = [];
    visitJsxTags(source.sourceFile, (node: JsxTagNode) => {
      if (!isDomHost(tagNameOf(node))) return;
      if (isPropSpreadingHost(node)) return;
      if (isDecorativeOrHidden(node)) return;
      if (
        !hasAnyAttr(node, [
          "onPointerDown",
          "onTouchStart",
          "onPointerMove",
          "onTouchMove",
        ])
      ) {
        return;
      }
      if (isNativeInteractive(node)) return;
      if (hasKeyboardHandlers(node)) return;
      findings.push({
        checkId: "pointer-gesture",
        kind: "warning",
        severity: "moderate",
        confidence: "low",
        reason: `<${tagNameOf(node)}> handles a pointer or touch gesture without a keyboard equivalent (onKeyDown). Keyboard users cannot perform the path-dependent gesture.`,
        location: locationOf(source, node),
        fix: null,
      });
    });
    return findings;
  },
};
