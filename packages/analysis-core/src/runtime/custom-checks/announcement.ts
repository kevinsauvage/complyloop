import type { Page } from "playwright";
import type { CustomViolation, CustomViolationNode } from "./types.js";

/**
 * Dynamic announcements (§18).
 *
 * A static check can prove `aria-live` exists but not that a user receives the
 * announcement. Here we verify a runtime precondition for a live region to
 * actually announce: it must be in the accessibility tree, i.e. not hidden or
 * aria-hidden, when content changes.
 *
 * Maps to `status-live` (RGAA 7.5 · WCAG 4.1.3).
 */
export async function announcementViolations(
  page: Page,
): Promise<CustomViolation | null> {
  const nodes = await page.evaluate(() => {
    const found: Array<{
      html: string;
      target: string[];
      elementLabel: string;
      failureSummary: string;
    }> = [];

    function selectorOf(el: Element): string {
      if (el.id) return `#${el.id}`;
      const live = el.getAttribute("aria-live");
      if (live) return `[aria-live="${live}"]`;
      const role = el.getAttribute("role");
      return role ? `[role="${role}"]` : el.tagName.toLowerCase();
    }

    function hiddenFromAT(el: Element): boolean {
      let node: Element | null = el;
      while (node) {
        if (node.getAttribute("aria-hidden") === "true") return true;
        const htmlEl = node as HTMLElement;
        if (htmlEl.hidden) return true;
        const style = htmlEl.style;
        if (
          style &&
          (style.display === "none" || style.visibility === "hidden")
        ) {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    }

    document
      .querySelectorAll('[aria-live], [role="status"], [role="alert"]')
      .forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        if ((el.textContent ?? "").trim().length === 0) return;
        if (!hiddenFromAT(el)) return;
        found.push({
          html: (el.outerHTML || "").replace(/\s+/g, " ").trim().slice(0, 200),
          target: [selectorOf(el)],
          elementLabel: el.getAttribute("aria-live")
            ? "live region"
            : "status region",
          failureSummary:
            "A live region is hidden or aria-hidden, so its content changes will not be announced to assistive technology.",
        });
      });

    return found.slice(0, 10);
  });

  if (nodes.length === 0) return null;
  return {
    id: "complyloop-announcement",
    impact: "serious",
    description:
      "A live region whose updates should be announced is hidden from assistive technology.",
    help: "Status messages must reach users through a visible, non-hidden live region (WCAG 4.1.3 / RGAA 7.5).",
    nodes: nodes as CustomViolationNode[],
  };
}