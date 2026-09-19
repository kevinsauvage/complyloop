import type { Locator, Page } from "playwright-core";

import { parseCssColor } from "../css-color.ts";
import { type CapturedHit } from "./hit-capture.ts";
import {
  locatorEvaluateWithHitCapture,
  pageEvaluateWithHitCapture,
} from "./hit-capture-evaluate.ts";
import { NON_TEXT_CONTRAST_CONTROL_SELECTOR } from "./interactive-control-selectors.ts";
import type { CustomViolation, CustomViolationNode } from "./types.ts";
import { selectorOf } from "./widget-keyboard-utils.ts";

export function parseRgb(value: string): [number, number, number] | null {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const MAX_HOVER = 12;
const MAX_NODES = 5;

interface ContrastHit extends CapturedHit {
  state: "default" | "hover" | "selected";
  ratio: number;
}

const MATH_PAYLOAD = {
  parseColorSrc: parseCssColor.toString(),
  luminanceSrc: relativeLuminance.toString(),
  contrastSrc: contrastRatio.toString(),
};

export async function nonTextContrastViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const {
    violations: initial,
    controlCount,
    borderSample,
  } = await collectCurrentHits(page);
  // Serialization sample: border colors serialize per Chromium build
  // (legacy rgb() vs lab()/color()), which used to decide silently whether
  // an element was measurable at all.
  console.info(
    `[diag] non-text-contrast controls=${controlCount} borderSample=${borderSample}`,
  );
  const hits: ContrastHit[] = [...initial];

  const locators = page.locator(NON_TEXT_CONTRAST_CONTROL_SELECTOR);
  const hoverCount = Math.min(await locators.count(), MAX_HOVER);
  for (
    let index = 0;
    index < hoverCount && hits.length < MAX_NODES;
    index += 1
  ) {
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
    if (
      hits.some(
        (existing) =>
          existing.id === hoverHit.id &&
          existing.role === hoverHit.role &&
          existing.tagName === hoverHit.tagName &&
          existing.state === "hover",
      )
    ) {
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

async function collectCurrentHits(page: Page): Promise<{
  violations: ContrastHit[];
  controlCount: number;
  borderSample: string;
}> {
  return pageEvaluateWithHitCapture(
    page,
    (
      captureHit,
      { parseColorSrc, luminanceSrc, contrastSrc, controlSelector },
    ) => {
      const parseColor = new Function(
        "value",
        `const parseCssColor = (${parseColorSrc}); return parseCssColor(value);`,
      ) as typeof parseCssColor;
      const contrast = new Function(
        "a",
        "b",
        `const relativeLuminance = (${luminanceSrc}); const contrastRatio = (${contrastSrc}); return contrastRatio(a, b);`,
      ) as (a: [number, number, number], b: [number, number, number]) => number;

      function backgroundRgb(el: Element): [number, number, number] | null {
        let current: Element | null = el;
        while (current) {
          const parsed = parseColor(getComputedStyle(current).backgroundColor);
          if (parsed && parsed.alpha > 0) return parsed.rgb;
          current = current.parentElement;
        }
        const bodyParsed = parseColor(
          getComputedStyle(document.body).backgroundColor,
        );
        return bodyParsed && bodyParsed.alpha > 0 ? bodyParsed.rgb : null;
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
      const controls = Array.from(document.querySelectorAll(controlSelector));
      const first = controls[0];
      const borderSample =
        first instanceof HTMLElement
          ? getComputedStyle(first).borderTopColor
          : "";
      for (const el of controls) {
        if (!(el instanceof HTMLElement)) continue;
        if (isDisabled(el)) continue;
        const style = getComputedStyle(el);
        const borderWidth = parseFloat(style.borderTopWidth);
        if (borderWidth <= 0) continue;
        const parsedBorder = parseColor(style.borderTopColor);
        // Fully transparent borders are placeholders, not chrome: there is
        // no visible boundary whose contrast could fail. Unparsable
        // serializations are skipped rather than measured as garbage.
        if (!parsedBorder || parsedBorder.alpha === 0) continue;
        const border = parsedBorder.rgb;
        const bg = backgroundRgb(el);
        if (!bg) continue;
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
      return { violations, controlCount: controls.length, borderSample };
    },
    { ...MATH_PAYLOAD, controlSelector: NON_TEXT_CONTRAST_CONTROL_SELECTOR },
  );
}

async function collectHoverHit(locator: Locator): Promise<ContrastHit | null> {
  return locatorEvaluateWithHitCapture(
    locator,
    (captureHit, el, { parseColorSrc, luminanceSrc, contrastSrc }) => {
      const parseColor = new Function(
        "value",
        `const parseCssColor = (${parseColorSrc}); return parseCssColor(value);`,
      ) as typeof parseCssColor;
      const contrast = new Function(
        "a",
        "b",
        `const relativeLuminance = (${luminanceSrc}); const contrastRatio = (${contrastSrc}); return contrastRatio(a, b);`,
      ) as (a: [number, number, number], b: [number, number, number]) => number;

      function backgroundRgb(node: Element): [number, number, number] | null {
        let current: Element | null = node;
        while (current) {
          const parsed = parseColor(getComputedStyle(current).backgroundColor);
          if (parsed && parsed.alpha > 0) return parsed.rgb;
          current = current.parentElement;
        }
        const bodyParsed = parseColor(
          getComputedStyle(document.body).backgroundColor,
        );
        return bodyParsed && bodyParsed.alpha > 0 ? bodyParsed.rgb : null;
      }

      const style = getComputedStyle(el);
      const borderWidth = parseFloat(style.borderTopWidth);
      if (borderWidth <= 0) return null;
      const parsedBorder = parseColor(style.borderTopColor);
      if (!parsedBorder || parsedBorder.alpha === 0) return null;
      const border = parsedBorder.rgb;
      const bg = backgroundRgb(el);
      if (!bg) return null;
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
