import type { Page } from "playwright";

import { type CapturedHit } from "./hit-capture.ts";
import { pageEvaluateWithHitCapture } from "./hit-capture-evaluate.ts";
import type { CustomViolation, CustomViolationNode } from "./types.ts";

export interface FocusStyleSnapshot {
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  boxShadow: string;
  borderTopWidth: string;
  borderTopColor: string;
  borderRightWidth: string;
  borderRightColor: string;
  borderBottomWidth: string;
  borderBottomColor: string;
  borderLeftWidth: string;
  borderLeftColor: string;
  backgroundColor: string;
}

export function snapshotFocusStyles(style: FocusStyleSnapshot): FocusStyleSnapshot {
  return {
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    outlineColor: style.outlineColor,
    boxShadow: style.boxShadow,
    borderTopWidth: style.borderTopWidth,
    borderTopColor: style.borderTopColor,
    borderRightWidth: style.borderRightWidth,
    borderRightColor: style.borderRightColor,
    borderBottomWidth: style.borderBottomWidth,
    borderBottomColor: style.borderBottomColor,
    borderLeftWidth: style.borderLeftWidth,
    borderLeftColor: style.borderLeftColor,
    backgroundColor: style.backgroundColor,
  };
}

/**
 * Focus-visibility comparison (WCAG 2.4.7 / RGAA 10.7). Looking at the focused
 * computed style alone false-positives border-only indicators and false-negatives
 * persistent shadows. The indicator is the *difference* between focused and
 * unfocused appearance. Self-contained so it serializes into `page.evaluate`.
 */
export function hasVisibleFocusIndicator(
  focused: FocusStyleSnapshot,
  unfocused: FocusStyleSnapshot,
): boolean {
  function transparent(color: string): boolean {
    if (color === "transparent") return true;
    const match = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*([\d.]+))?\s*\)/.exec(
      color,
    );
    if (!match) return false;
    return match[1] !== undefined && Number(match[1]) === 0;
  }

  function outlineVisible(snapshot: FocusStyleSnapshot): boolean {
    if (snapshot.outlineStyle === "auto") return true;
    if (snapshot.outlineStyle === "none") return false;
    if ((parseFloat(snapshot.outlineWidth) || 0) <= 0) return false;
    return !transparent(snapshot.outlineColor);
  }

  if (outlineVisible(focused)) {
    const appeared =
      focused.outlineStyle !== unfocused.outlineStyle ||
      focused.outlineWidth !== unfocused.outlineWidth ||
      focused.outlineColor !== unfocused.outlineColor;
    if (appeared) return true;
  }

  if (focused.boxShadow !== unfocused.boxShadow && focused.boxShadow !== "none") {
    return true;
  }

  const borderChanged =
    focused.borderTopWidth !== unfocused.borderTopWidth ||
    focused.borderTopColor !== unfocused.borderTopColor ||
    focused.borderRightWidth !== unfocused.borderRightWidth ||
    focused.borderRightColor !== unfocused.borderRightColor ||
    focused.borderBottomWidth !== unfocused.borderBottomWidth ||
    focused.borderBottomColor !== unfocused.borderBottomColor ||
    focused.borderLeftWidth !== unfocused.borderLeftWidth ||
    focused.borderLeftColor !== unfocused.borderLeftColor;
  if (borderChanged) {
    const width =
      parseFloat(focused.borderTopWidth) ||
      parseFloat(focused.borderRightWidth) ||
      parseFloat(focused.borderBottomWidth) ||
      parseFloat(focused.borderLeftWidth) ||
      0;
    if (width > 0 && !transparent(focused.borderTopColor)) return true;
  }

  return focused.backgroundColor !== unfocused.backgroundColor;
}

/**
 * Returns true when recent Tab focus keys cycle among very few elements — a
 * signal of an unintentional keyboard trap (modals are excluded upstream).
 */
export function isSuspectedKeyboardTrap(
  sequence: readonly string[],
  tailLength = 12,
  maxUniqueFocusables = 2,
): boolean {
  const tail = sequence.slice(-tailLength);
  if (tail.includes("modal")) return false;
  const unique = new Set(tail.filter((key) => key !== "body" && key !== "modal"));
  return unique.size <= maxUniqueFocusables;
}

const MAX_TAB_STEPS = 80;
const SNAPSHOT_FOCUS_STYLES_SOURCE = snapshotFocusStyles.toString();
const HAS_VISIBLE_FOCUS_INDICATOR_SOURCE = hasVisibleFocusIndicator.toString();
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export async function focusCustomViolations(
  page: Page,
): Promise<CustomViolation[]> {
  const violations: CustomViolation[] = [];

  const focusVisibleNodes = await collectFocusVisibleViolations(page);
  if (focusVisibleNodes.length > 0) {
    violations.push({
      id: "focus-visible",
      impact: "serious",
      description:
        "Focused element has no visible change from its unfocused appearance (outline, ring, border, or background).",
      help: "Keyboard users must see which control has focus (WCAG 2.4.7).",
      nodes: focusVisibleNodes,
    });
  }

  const trapNode = await detectKeyboardTrap(page);
  if (trapNode) {
    violations.push({
      id: "keyboard-trap",
      impact: "critical",
      description:
        "Keyboard focus appears trapped in a small set of elements and cannot reach the rest of the page.",
      help: "Users must be able to Tab away from every widget except intentional modal dialogs (WCAG 2.1.2).",
      nodes: [trapNode],
    });
  }

  const obscuredNodes = await collectFocusObscuredViolations(page, false);
  if (obscuredNodes.length > 0) {
    violations.push({
      id: "focus-not-obscured",
      impact: "serious",
      description:
        "Focused control is covered by another element (sticky header, banner, or overlay).",
      help: "Focused controls must not be fully hidden by other content (WCAG 2.4.11).",
      nodes: obscuredNodes,
    });
  }

  const obscuredEnhancedNodes = await collectFocusObscuredViolations(page, true);
  if (obscuredEnhancedNodes.length > 0) {
    violations.push({
      id: "focus-not-obscured-enhanced",
      impact: "serious",
      description:
        "Any part of the focused control is covered by other content.",
      help: "No part of the focused control may be hidden (WCAG 2.4.12).",
      nodes: obscuredEnhancedNodes,
    });
  }

  const appearanceNodes = await collectFocusAppearanceViolations(page);
  if (appearanceNodes.length > 0) {
    violations.push({
      id: "focus-appearance",
      impact: "moderate",
      description:
        "Focus indicator is too thin to meet minimum size requirements.",
      help: "Focus indicators need sufficient area and contrast (WCAG 2.4.13).",
      nodes: appearanceNodes,
    });
  }

  return violations;
}

function toViolationNode(capture: CapturedHit): CustomViolationNode {
  return {
    html: capture.html,
    target: [capture.selector],
    elementLabel: capture.elementLabel,
    failureSummary: capture.context,
  };
}

async function collectFocusVisibleViolations(
  page: Page,
): Promise<CustomViolationNode[]> {
  const nodes: CustomViolationNode[] = [];
  const seen = new Set<string>();

  await page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
  });

  const unfocusedSnapshots = await page.evaluate(
    ({ snapshotSrc, selector }) => {
      const snapshot = new Function(`return (${snapshotSrc})`)() as typeof snapshotFocusStyles;
      return Array.from(document.querySelectorAll(selector)).map((el) =>
        snapshot(getComputedStyle(el)),
      );
    },
    {
      snapshotSrc: SNAPSHOT_FOCUS_STYLES_SOURCE,
      selector: FOCUSABLE_SELECTOR,
    },
  );

  for (let step = 0; step < MAX_TAB_STEPS; step++) {
    await page.keyboard.press("Tab");
    const hit = await pageEvaluateWithHitCapture(
      page,
      (
        captureHit,
        {
          snapshotSrc,
          indicatorSrc,
          selector,
          unfocused,
        },
      ) => {
        const snapshot = new Function(`return (${snapshotSrc})`)() as typeof snapshotFocusStyles;
        const indicatorVisible = new Function(
          `return (${indicatorSrc})`,
        )() as typeof hasVisibleFocusIndicator;

        const el = document.activeElement;
        if (
          !el ||
          el === document.body ||
          el === document.documentElement ||
          !(el instanceof HTMLElement)
        ) {
          return null;
        }
        if (!el.matches(":focus-visible")) return null;

        const focusables = Array.from(document.querySelectorAll(selector));
        const index = focusables.indexOf(el);
        const rest = unfocused[index];
        if (!rest) return null;
        const focused = snapshot(getComputedStyle(el));
        if (indicatorVisible(focused, rest)) return null;

        const capture = captureHit(el);
        return { key: capture.selector, capture };
      },
      {
        snapshotSrc: SNAPSHOT_FOCUS_STYLES_SOURCE,
        indicatorSrc: HAS_VISIBLE_FOCUS_INDICATOR_SOURCE,
        selector: FOCUSABLE_SELECTOR,
        unfocused: unfocusedSnapshots,
      },
    );
    if (!hit || seen.has(hit.key)) {
      if (step > 5 && seen.size > 0) break;
      continue;
    }
    seen.add(hit.key);
    nodes.push(toViolationNode(hit.capture));
  }

  return nodes;
}

async function detectKeyboardTrap(
  page: Page,
): Promise<CustomViolationNode | null> {
  const focusableCount = await page.evaluate((selector) => {
    return document.querySelectorAll(selector).length;
  }, FOCUSABLE_SELECTOR);
  if (focusableCount < 3) return null;

  const sequence: string[] = [];
  const maxSteps = Math.min(focusableCount * 2 + 5, MAX_TAB_STEPS);
  for (let step = 0; step < maxSteps; step++) {
    await page.keyboard.press("Tab");
    const key = await page.evaluate(() => {
      function isIntentionalModalTrap(el: Element | null): boolean {
        if (!el) return false;
        return (
          el.closest('[aria-modal="true"]') !== null ||
          el.closest("dialog[open]") !== null
        );
      }

      const el = document.activeElement;
      if (!el || el === document.body) return "body";
      if (isIntentionalModalTrap(el)) return "modal";
      const html = el as HTMLElement;
      if (html.id) return `#${html.id}`;
      return `${html.tagName.toLowerCase()}:${html.className}`;
    });
    sequence.push(key);
  }

  if (!isSuspectedKeyboardTrap(sequence)) return null;

  const trap = await pageEvaluateWithHitCapture(page, (captureHit) => {
    function isIntentionalModalTrap(el: Element | null): boolean {
      if (!el) return false;
      return (
        el.closest('[aria-modal="true"]') !== null ||
        el.closest("dialog[open]") !== null
      );
    }

    const el = document.activeElement;
    if (!el || el === document.body || isIntentionalModalTrap(el)) return null;
    if (!(el instanceof HTMLElement)) return null;
    return captureHit(el);
  });

  return trap ? toViolationNode(trap) : null;
}

async function collectFocusObscuredViolations(
  page: Page,
  enhanced: boolean,
): Promise<CustomViolationNode[]> {
  const nodes: CustomViolationNode[] = [];
  const seen = new Set<string>();

  for (let step = 0; step < MAX_TAB_STEPS; step++) {
    await page.keyboard.press("Tab");
    const hit = await pageEvaluateWithHitCapture(
      page,
      (captureHit, { enhancedMode }) => {
        function pointObscured(el: Element, x: number, y: number): boolean {
          const top = document.elementFromPoint(x, y);
          if (!top) return false;
          return top !== el && !el.contains(top) && !top.contains(el);
        }

        function firstObscuredCorner(
          el: Element,
          strict: boolean,
        ): { x: number; y: number; corner: string } | undefined {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return undefined;
          const corners = strict
            ? [
                { corner: "top-left", x: rect.left + 1, y: rect.top + 1 },
                { corner: "top-right", x: rect.right - 1, y: rect.top + 1 },
                { corner: "bottom-left", x: rect.left + 1, y: rect.bottom - 1 },
                { corner: "bottom-right", x: rect.right - 1, y: rect.bottom - 1 },
                {
                  corner: "center",
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2,
                },
              ]
            : [
                {
                  corner: "center",
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2,
                },
              ];
          return corners.find((corner) =>
            pointObscured(el, corner.x, corner.y),
          );
        }

        const el = document.activeElement;
        if (
          !el ||
          el === document.body ||
          el === document.documentElement ||
          !(el instanceof HTMLElement)
        ) {
          return null;
        }
        if (!el.matches(":focus-visible")) return null;
        const obscuredAt = firstObscuredCorner(el, enhancedMode);
        if (!obscuredAt) return null;
        const capture = captureHit(el, { obscuredAt });
        return { key: capture.selector, capture };
      },
      { enhancedMode: enhanced },
    );
    if (!hit || seen.has(hit.key)) {
      if (step > 5 && seen.size > 0) break;
      continue;
    }
    seen.add(hit.key);
    nodes.push(toViolationNode(hit.capture));
  }

  return nodes;
}

async function collectFocusAppearanceViolations(
  page: Page,
): Promise<CustomViolationNode[]> {
  const nodes: CustomViolationNode[] = [];
  const seen = new Set<string>();

  for (let step = 0; step < MAX_TAB_STEPS; step++) {
    await page.keyboard.press("Tab");
    const hit = await pageEvaluateWithHitCapture(page, (captureHit) => {
      function focusIndicatorTooSmall(el: Element): boolean {
        const style = getComputedStyle(el);
        const outlineWidth = parseFloat(style.outlineWidth) || 0;
        if (outlineWidth >= 2) return false;
        const shadow = style.boxShadow;
        if (!shadow || shadow === "none") return true;
        const match = /(\d+(?:\.\d+)?)px/.exec(shadow);
        if (!match) return true;
        return parseFloat(match[1] ?? "0") < 2;
      }

      const el = document.activeElement;
      if (
        !el ||
        el === document.body ||
        el === document.documentElement ||
        !(el instanceof HTMLElement)
      ) {
        return null;
      }
      if (!el.matches(":focus-visible")) return null;
      if (!focusIndicatorTooSmall(el)) return null;
      const capture = captureHit(el);
      return { key: capture.selector, capture };
    });
    if (!hit || seen.has(hit.key)) {
      if (step > 5 && seen.size > 0) break;
      continue;
    }
    seen.add(hit.key);
    nodes.push(toViolationNode(hit.capture));
  }

  return nodes;
}
