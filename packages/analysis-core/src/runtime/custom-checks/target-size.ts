import type { Page } from "playwright";
import {
  hasSpacingException,
  isInlineTarget,
  isUserAgentTarget,
  meetsMinimumTargetSize,
} from "./target-size-geometry.js";
import type { CustomViolation, CustomViolationNode } from "./types.js";

const TARGET_VIEWPORT = { width: 320, height: 568 };
const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
].join(", ");

/**
 * Pointer target size at a 320px viewport (WCAG 2.5.8).
 *
 * axe-core's `target-size` runs at the default desktop viewport and does not
 * apply the spacing / inline / user-agent exceptions the same way. This pass
 * measures rendered bounds on a small viewport, skips UA widgets and in-sentence
 * links, and only flags undersized targets whose 24px spacing circle hits a
 * neighbor — so isolated icon buttons are not noise.
 */
export async function targetSizeViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const original = page.viewportSize();
  try {
    await page.setViewportSize(TARGET_VIEWPORT);
    const nodes = await page.evaluate(
      ({ selector, minSrc, spacingSrc, inlineSrc, uaSrc }) => {
        const meetsMin = new Function(`return (${minSrc})`)() as typeof meetsMinimumTargetSize;
        const spacingOk = new Function(`return (${spacingSrc})`)() as typeof hasSpacingException;
        const inline = new Function(`return (${inlineSrc})`)() as typeof isInlineTarget;
        const userAgent = new Function(`return (${uaSrc})`)() as typeof isUserAgentTarget;

        function selectorOf(el: HTMLElement): string {
          if (el.id) return `#${el.id}`;
          const role = el.getAttribute("role");
          if (role) return `[role="${role}"]`;
          return el.tagName.toLowerCase();
        }

        function snippetOf(el: Element): string {
          return (el.outerHTML || "").replace(/\s+/g, " ").trim().slice(0, 160);
        }

        function isHidden(el: HTMLElement): boolean {
          if (el.hidden || el.getAttribute("aria-hidden") === "true") return true;
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return true;
          const rect = el.getBoundingClientRect();
          return rect.width === 0 || rect.height === 0;
        }

        const candidates = Array.from(document.querySelectorAll(selector)).filter(
          (el): el is HTMLElement => el instanceof HTMLElement && !isHidden(el),
        );

        const rects = candidates.map((el) => {
          const box = el.getBoundingClientRect();
          return { left: box.left, top: box.top, width: box.width, height: box.height };
        });

        const found: CustomViolationNode[] = [];
        const seen = new Set<string>();

        candidates.forEach((el, index) => {
          const box = rects[index];
          if (!box) return;
          if (userAgent(el.tagName, el.getAttribute("type"))) return;
          if (inline(getComputedStyle(el).display)) return;
          if (meetsMin(box)) return;
          const neighbors = rects.filter((_, i) => i !== index);
          if (spacingOk(box, neighbors)) return;

          const sel = selectorOf(el);
          if (seen.has(sel)) return;
          seen.add(sel);
          found.push({
            html: snippetOf(el),
            target: [sel],
            elementLabel: "pointer target",
            failureSummary: `Rendered size ${Math.round(box.width)}×${Math.round(box.height)} CSS pixels is below 24×24 and the 24px spacing circle intersects an adjacent target.`,
          });
        });

        return found.slice(0, 10);
      },
      {
        selector: INTERACTIVE_SELECTOR,
        minSrc: meetsMinimumTargetSize.toString(),
        spacingSrc: hasSpacingException.toString(),
        inlineSrc: isInlineTarget.toString(),
        uaSrc: isUserAgentTarget.toString(),
      },
    );

    if (nodes.length === 0) return null;
    return {
      id: "complyloop-target-size",
      impact: "serious",
      description:
        "A pointer target is smaller than 24×24 CSS pixels without a spacing, inline, or user-agent exception.",
      help: "Make the clickable area at least 24×24 CSS pixels, or leave 24px of space from adjacent targets (WCAG 2.5.8).",
      nodes,
    };
  } finally {
    if (original) {
      await page.setViewportSize(original);
    }
  }
}
