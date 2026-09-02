import type { Page } from "playwright";
import type { CustomViolation } from "./types";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export async function focusOrderLogicalViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const hit = await page.evaluate((selector) => {
    function selectorOf(el: Element): string {
      if (el.id) return `#${el.id}`;
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");
      return role ? `${tag}[role="${role}"]` : tag;
    }

    const elements = Array.from(document.querySelectorAll(selector)).filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );
    if (elements.length < 3) return null;

    const tabOrder = [...elements];
    const visualOrder = [...elements].sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const rowDelta = ra.top - rb.top;
      if (Math.abs(rowDelta) > 8) return rowDelta;
      return ra.left - rb.left;
    });

    let inversions = 0;
    for (let i = 0; i < tabOrder.length; i += 1) {
      for (let j = i + 1; j < tabOrder.length; j += 1) {
        const tabI = tabOrder.indexOf(visualOrder[i]!);
        const tabJ = tabOrder.indexOf(visualOrder[j]!);
        if (tabI > tabJ) inversions += 1;
      }
    }

    const maxInversions = (tabOrder.length * (tabOrder.length - 1)) / 4;
    if (inversions < maxInversions) return null;

    const el = tabOrder[0]!;
    const html = el.outerHTML.replace(/\s+/g, " ").trim();
    return {
      html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
      selector: selectorOf(el),
      inversions,
    };
  }, FOCUSABLE_SELECTOR);

  if (!hit) return null;
  return {
    id: "complyloop-focus-order-logical",
    impact: "moderate",
    description:
      "Keyboard tab order diverges from the visual layout, which can confuse keyboard users.",
    help: "Align DOM/focus order with the visual reading order (WCAG 2.4.3 / RGAA 12.8).",
    nodes: [{ html: hit.html, target: [hit.selector] }],
  };
}
