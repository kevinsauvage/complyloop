import type { Page } from "playwright";
import { captureDomTarget } from "../dom-target.js";
import type { CustomViolation, CustomViolationNode } from "./types.js";

const MAX_TAB_STEPS = 80;
const CAPTURE_DOM_TARGET_SOURCE = captureDomTarget.toString();

export async function focusCustomViolations(
  page: Page,
): Promise<CustomViolation[]> {
  const violations: CustomViolation[] = [];

  const focusVisibleNodes = await collectFocusVisibleViolations(page);
  if (focusVisibleNodes.length > 0) {
    violations.push({
      id: "complyloop-focus-visible",
      impact: "serious",
      description:
        "Focused element has no visible focus indicator (outline, ring, or box-shadow).",
      help: "Keyboard users must see which control has focus (WCAG 2.4.7).",
      nodes: focusVisibleNodes,
    });
  }

  const trapNode = await detectKeyboardTrap(page);
  if (trapNode) {
    violations.push({
      id: "complyloop-keyboard-trap",
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
      id: "complyloop-focus-not-obscured",
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
      id: "complyloop-focus-not-obscured-enhanced",
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
      id: "complyloop-focus-appearance",
      impact: "moderate",
      description:
        "Focus indicator is too thin to meet minimum size requirements.",
      help: "Focus indicators need sufficient area and contrast (WCAG 2.4.13).",
      nodes: appearanceNodes,
    });
  }

  return violations;
}

function toViolationNode(capture: ReturnType<typeof captureDomTarget>): CustomViolationNode {
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

  for (let step = 0; step < MAX_TAB_STEPS; step++) {
    await page.keyboard.press("Tab");
    const hit = await page.evaluate((captureSrc) => {
      const captureElement = new Function(`return (${captureSrc})`)() as (
        ...args: Parameters<typeof captureDomTarget>
      ) => ReturnType<typeof captureDomTarget>;

      function hasVisibleFocusIndicator(el: Element): boolean {
        const style = getComputedStyle(el);
        const outlineVisible =
          style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
        if (outlineVisible) return true;
        return Boolean(style.boxShadow && style.boxShadow !== "none");
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
      if (hasVisibleFocusIndicator(el)) return null;
      const capture = captureElement(el);
      return { key: capture.selector, capture };
    }, CAPTURE_DOM_TARGET_SOURCE);
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
  const focusableCount = await page.evaluate(() => {
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return document.querySelectorAll(selector).length;
  });
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

  const tail = sequence.slice(-12);
  const unique = new Set(tail.filter((key) => key !== "body" && key !== "modal"));
  if (unique.size > 2) return null;
  if (tail.includes("modal")) return null;

  const trap = await page.evaluate((captureSrc) => {
    const captureElement = new Function(`return (${captureSrc})`)() as (
      ...args: Parameters<typeof captureDomTarget>
    ) => ReturnType<typeof captureDomTarget>;

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
    return captureElement(el);
  }, CAPTURE_DOM_TARGET_SOURCE);

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
    const hit = await page.evaluate(
      ({ captureSrc, enhancedMode }) => {
        const captureElement = new Function(`return (${captureSrc})`)() as (
          ...args: Parameters<typeof captureDomTarget>
        ) => ReturnType<typeof captureDomTarget>;

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
        const capture = captureElement(el, { obscuredAt });
        return { key: capture.selector, capture };
      },
      { captureSrc: CAPTURE_DOM_TARGET_SOURCE, enhancedMode: enhanced },
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
    const hit = await page.evaluate((captureSrc) => {
      const captureElement = new Function(`return (${captureSrc})`)() as (
        ...args: Parameters<typeof captureDomTarget>
      ) => ReturnType<typeof captureDomTarget>;

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
      const capture = captureElement(el);
      return { key: capture.selector, capture };
    }, CAPTURE_DOM_TARGET_SOURCE);
    if (!hit || seen.has(hit.key)) {
      if (step > 5 && seen.size > 0) break;
      continue;
    }
    seen.add(hit.key);
    nodes.push(toViolationNode(hit.capture));
  }

  return nodes;
}
