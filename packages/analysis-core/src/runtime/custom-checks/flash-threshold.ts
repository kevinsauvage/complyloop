import type { Page } from "playwright";
import type { CustomViolation } from "./types.js";

const MAX_FLASH_PERIOD_S = 1 / 3;
const MIN_FLASH_AREA_RATIO = 0.1;

export async function flashThresholdViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const hit = await page.evaluate(
    ({ maxPeriod, minAreaRatio }) => {
      function selectorOf(el: Element): string {
        if (el.id) return `#${el.id}`;
        return el.tagName.toLowerCase();
      }

      function parseTime(value: string): number | null {
        const trimmed = value.trim();
        if (!trimmed || trimmed === "none") return null;
        if (trimmed.endsWith("ms")) {
          return parseFloat(trimmed) / 1000;
        }
        if (trimmed.endsWith("s")) {
          return parseFloat(trimmed);
        }
        const parsed = parseFloat(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
      }

      const viewportArea = window.innerWidth * window.innerHeight;
      if (viewportArea <= 0) return null;

      for (const el of document.querySelectorAll<HTMLElement>("*")) {
        const style = getComputedStyle(el);
        const duration = parseTime(style.animationDuration);
        const delay = parseTime(style.animationDelay) ?? 0;
        if (duration === null || duration <= 0) continue;
        if (duration > maxPeriod) continue;
        if (style.animationIterationCount !== "infinite") continue;

        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area / viewportArea < minAreaRatio) continue;

        const html = el.outerHTML.replace(/\s+/g, " ").trim();
        return {
          html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
          selector: selectorOf(el),
          period: duration + delay,
        };
      }

      return null;
    },
    { maxPeriod: MAX_FLASH_PERIOD_S, minAreaRatio: MIN_FLASH_AREA_RATIO },
  );

  if (!hit) return null;

  return {
    id: "complyloop-flash-threshold",
    impact: "critical",
    description:
      "A large animated region flashes faster than three times per second, which may trigger seizures.",
    help: "Slow or remove rapid full-area animations; keep flashes below three per second (WCAG 2.3.1 / RGAA 13.7).",
    nodes: [{ html: hit.html, target: [hit.selector] }],
  };
}
