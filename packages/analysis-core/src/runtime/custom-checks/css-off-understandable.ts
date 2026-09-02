import type { Page } from "playwright";
import type { CustomViolation } from "./types.js";

export async function cssOffUnderstandableViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const hit = await page.evaluate(() => {
    function selectorOf(el: Element): string {
      if (el.id) return `#${el.id}`;
      return el.tagName.toLowerCase();
    }

    function visibleTextLength(): number {
      return document.body.innerText.replace(/\s+/g, " ").trim().length;
    }

    function disableStylesheets(): void {
      for (const sheet of document.querySelectorAll('link[rel="stylesheet"]')) {
        sheet.setAttribute("disabled", "true");
      }
      for (const style of document.querySelectorAll("style")) {
        style.disabled = true;
      }
    }

    function flexOrderDependents(): HTMLElement[] {
      const hits: HTMLElement[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("*")) {
        const style = getComputedStyle(el);
        if (style.order === "0" || style.order === "normal") continue;
        const parent = el.parentElement;
        if (!parent) continue;
        const parentDisplay = getComputedStyle(parent).display;
        if (!parentDisplay.includes("flex") && !parentDisplay.includes("grid")) {
          continue;
        }
        hits.push(el);
      }
      return hits;
    }

    const beforeLength = visibleTextLength();
    const orderDependents = flexOrderDependents();
    disableStylesheets();
    const afterLength = visibleTextLength();

    if (
      beforeLength > 80 &&
      afterLength < beforeLength * 0.55
    ) {
      const main =
        document.querySelector("main") ??
        document.querySelector('[role="main"]') ??
        document.body;
      const html = main.outerHTML.replace(/\s+/g, " ").trim();
      return {
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        selector: selectorOf(main),
        reason: "text_loss" as const,
      };
    }

    if (orderDependents.length > 0) {
      const el = orderDependents[0]!;
      const html = el.outerHTML.replace(/\s+/g, " ").trim();
      return {
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        selector: selectorOf(el),
        reason: "flex_order" as const,
      };
    }

    return null;
  });

  if (!hit) return null;

  const description =
    hit.reason === "text_loss"
      ? "Disabling stylesheets hides or removes a large share of visible text, so meaning may be lost."
      : "Flex/grid order properties reorder content visually; that order is lost when CSS is disabled.";

  return {
    id: "complyloop-css-off-understandable",
    impact: "moderate",
    description,
    help: "Keep reading order and essential content in the DOM so it remains understandable without CSS (WCAG 1.3.2 / RGAA 10.3).",
    nodes: [{ html: hit.html, target: [hit.selector] }],
  };
}
