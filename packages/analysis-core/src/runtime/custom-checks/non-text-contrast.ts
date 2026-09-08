import type { Locator, Page } from "playwright";
import { contrastRatio, parseRgb, relativeLuminance } from "./non-text-contrast-math.ts";
import { type CapturedHit } from "./hit-capture.ts";
import {
  locatorEvaluateWithHitCapture,
  pageEvaluateWithHitCapture,
} from "./hit-capture-evaluate.ts";
import type { CustomViolation, CustomViolationNode } from "./types.ts";
import { selectorOf } from "./widget-keyboard-utils.ts";

const CONTROL_SELECTOR =
  'button, input:not([type="hidden"]), select, textarea, a[href], [role="button"], [role="checkbox"], [role="radio"]';

const MAX_HOVER = 12;
const MAX_NODES = 5;

interface ContrastHit extends CapturedHit {
  state: "default" | "hover" | "selected";
  ratio: number;
}

const MATH_PAYLOAD = {
  parseRgbSrc: parseRgb.toString(),
  luminanceSrc: relativeLuminance.toString(),
  contrastSrc: contrastRatio.toString(),
};

export async function nonTextContrastViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const hits: ContrastHit[] = await collectCurrentHits(page);

  const locators = page.locator(CONTROL_SELECTOR);
  const hoverCount = Math.min(await locators.count(), MAX_HOVER);
  for (let index = 0; index < hoverCount && hits.length < MAX_NODES; index += 1) {
    const locator = locators.nth(index);
    if (!(await locator.isVisible())) continue;
    if (await locator.isDisabled()) continue;
    try {
      await locator.hover({ timeout: 800 });
    } catch {
      continue;
    }
    const hoverHit = await collectHoverHit(locator);
    await page.mouse.move(0, 0);
    if (!hoverHit) continue;
    if (hits.some(
      (existing) =>
        existing.id === hoverHit.id &&
        existing.role === hoverHit.role &&
        existing.tagName === hoverHit.tagName &&
        existing.state === "hover",
    )) {
      continue;
    }
    hits.push(hoverHit);
  }

  if (hits.length === 0) return null;

  const nodes: CustomViolationNode[] = hits.slice(0, MAX_NODES).map((hit) => ({
    html: hit.html,
    target: [selectorOf(hit)],
    failureSummary: `${hit.state} chrome contrast is ${hit.ratio.toFixed(2)}:1 (needs 3:1).`,
  }));

  return {
    id: "non-text-contrast",
    impact: "serious",
    description:
      "UI control chrome does not meet 3:1 contrast against its background in default, hover, or selected state (WCAG 1.4.11).",
    help: "Increase border or adjacent background contrast for interactive controls in every non-disabled state.",
    nodes,
  };
}

async function collectCurrentHits(page: Page): Promise<ContrastHit[]> {
  return pageEvaluateWithHitCapture(
    page,
    (captureHit, { parseRgbSrc, luminanceSrc, contrastSrc, controlSelector }) => {
      const parseColor = new Function(
        "value",
        `${parseRgbSrc}; return parseRgb(value);`,
      ) as (value: string) => [number, number, number] | null;
      const contrast = new Function(
        "a",
        "b",
        `${luminanceSrc}; ${contrastSrc}; return contrastRatio(a, b);`,
      ) as (
        a: [number, number, number],
        b: [number, number, number],
      ) => number;

      function backgroundRgb(el: Element): [number, number, number] | null {
        let current: Element | null = el;
        while (current) {
          const bg = parseColor(getComputedStyle(current).backgroundColor);
          if (bg && getComputedStyle(current).backgroundColor !== "rgba(0, 0, 0, 0)") {
            return bg;
          }
          current = current.parentElement;
        }
        return parseColor(getComputedStyle(document.body).backgroundColor);
      }

      function isDisabled(el: Element): boolean {
        return (
          (el instanceof HTMLButtonElement && el.disabled) ||
          (el instanceof HTMLInputElement && el.disabled) ||
          (el instanceof HTMLSelectElement && el.disabled) ||
          (el instanceof HTMLTextAreaElement && el.disabled) ||
          el.getAttribute("aria-disabled") === "true"
        );
      }

      function chromeState(el: Element): "default" | "selected" {
        if (
          el.getAttribute("aria-pressed") === "true" ||
          el.getAttribute("aria-selected") === "true" ||
          (el instanceof HTMLInputElement && el.checked)
        ) {
          return "selected";
        }
        return "default";
      }

      const violations: ContrastHit[] = [];
      for (const el of document.querySelectorAll(controlSelector)) {
        if (!(el instanceof HTMLElement)) continue;
        if (isDisabled(el)) continue;
        const style = getComputedStyle(el);
        const borderWidth = parseFloat(style.borderTopWidth);
        if (borderWidth <= 0) continue;
        const border = parseColor(style.borderTopColor);
        const bg = backgroundRgb(el);
        if (!border || !bg) continue;
        const ratio = contrast(border, bg);
        if (ratio >= 3) continue;

        const captured = captureHit(el);
        violations.push({
          ...captured,
          state: chromeState(el),
          ratio,
        });
        if (violations.length >= 5) break;
      }
      return violations;
    },
    { ...MATH_PAYLOAD, controlSelector: CONTROL_SELECTOR },
  );
}

async function collectHoverHit(locator: Locator): Promise<ContrastHit | null> {
  return locatorEvaluateWithHitCapture(
    locator,
    (captureHit, el, { parseRgbSrc, luminanceSrc, contrastSrc }) => {
      const parseColor = new Function(
        "value",
        `${parseRgbSrc}; return parseRgb(value);`,
      ) as (value: string) => [number, number, number] | null;
      const contrast = new Function(
        "a",
        "b",
        `${luminanceSrc}; ${contrastSrc}; return contrastRatio(a, b);`,
      ) as (
        a: [number, number, number],
        b: [number, number, number],
      ) => number;

      function backgroundRgb(node: Element): [number, number, number] | null {
        let current: Element | null = node;
        while (current) {
          const bg = parseColor(getComputedStyle(current).backgroundColor);
          if (bg && getComputedStyle(current).backgroundColor !== "rgba(0, 0, 0, 0)") {
            return bg;
          }
          current = current.parentElement;
        }
        return parseColor(getComputedStyle(document.body).backgroundColor);
      }

      const style = getComputedStyle(el);
      const borderWidth = parseFloat(style.borderTopWidth);
      if (borderWidth <= 0) return null;
      const border = parseColor(style.borderTopColor);
      const bg = backgroundRgb(el);
      if (!border || !bg) return null;
      const ratio = contrast(border, bg);
      if (ratio >= 3) return null;
      const captured = captureHit(el);
      return {
        ...captured,
        state: "hover" as const,
        ratio,
      };
    },
    MATH_PAYLOAD,
  );
}
