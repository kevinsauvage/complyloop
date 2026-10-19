import type { Page } from "playwright-core";

import {
  pageEvaluateWithHitCapture,
  toViolationNodes,
} from "./hit-capture-evaluate.ts";
import type { CustomViolation } from "./types.ts";

export async function cssOffUnderstandableViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const hit = await pageEvaluateWithHitCapture(page, (captureHit) => {
    function visibleTextLength(): number {
      return document.body.innerText.replace(/\s+/g, " ").trim().length;
    }

    const linkSnapshots: Array<{
      el: HTMLLinkElement;
      hadDisabledAttr: boolean;
    }> = [];
    const styleSnapshots: Array<{ el: HTMLStyleElement; disabled: boolean }> =
      [];

    function disableStylesheets(): void {
      for (const sheet of document.querySelectorAll('link[rel="stylesheet"]')) {
        const link = sheet as HTMLLinkElement;
        linkSnapshots.push({
          el: link,
          hadDisabledAttr: link.hasAttribute("disabled"),
        });
        link.setAttribute("disabled", "true");
      }
      for (const style of document.querySelectorAll("style")) {
        styleSnapshots.push({ el: style, disabled: style.disabled });
        style.disabled = true;
      }
    }

    function restoreStylesheets(): void {
      for (const { el, hadDisabledAttr } of linkSnapshots) {
        if (hadDisabledAttr) {
          el.setAttribute("disabled", "true");
        } else {
          el.removeAttribute("disabled");
        }
      }
      for (const { el, disabled } of styleSnapshots) {
        el.disabled = disabled;
      }
    }

    /**
     * Elements whose visual position differs from their DOM position because of
     * `order`. A container where `order` values simply restate the DOM sequence
     * (`order-1`, `order-2`, `order-3` on the first, second, third child) does
     * not reorder anything and is not a finding.
     */
    function flexOrderDependents(): HTMLElement[] {
      const hits: HTMLElement[] = [];
      const parents = new Set<HTMLElement>();
      for (const el of document.querySelectorAll<HTMLElement>("*")) {
        const style = getComputedStyle(el);
        if (style.order === "0" || style.order === "normal") continue;
        const parent = el.parentElement;
        if (!parent) continue;
        const parentDisplay = getComputedStyle(parent).display;
        if (
          !parentDisplay.includes("flex") &&
          !parentDisplay.includes("grid")
        ) {
          continue;
        }
        parents.add(parent);
      }
      for (const parent of parents) {
        const children = Array.from(parent.children).filter(
          (child): child is HTMLElement => child instanceof HTMLElement,
        );
        const dom = children.map((child, index) => ({
          child,
          index,
          order: Number.parseInt(getComputedStyle(child).order, 10) || 0,
        }));
        const visual = [...dom].sort(
          (a, b) => a.order - b.order || a.index - b.index,
        );
        const moved = visual.find((entry, position) => dom[position] !== entry);
        if (moved) hits.push(moved.child);
      }
      return hits;
    }

    const orderDependents = flexOrderDependents();

    try {
      const beforeLength = visibleTextLength();
      disableStylesheets();
      const afterLength = visibleTextLength();

      if (beforeLength > 80 && afterLength < beforeLength * 0.55) {
        const main =
          document.querySelector("main") ??
          document.querySelector('[role="main"]') ??
          document.body;
        const captured = captureHit(main);
        return {
          html: captured.html,
          id: captured.id,
          role: captured.role,
          tagName: captured.tagName,
          reason: "text_loss" as const,
        };
      }
    } finally {
      restoreStylesheets();
    }

    if (orderDependents.length > 0) {
      const el = orderDependents[0]!;
      const captured = captureHit(el);
      return {
        html: captured.html,
        id: captured.id,
        role: captured.role,
        tagName: captured.tagName,
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
    id: "css-off-understandable",
    impact: "moderate",
    description,
    help: "Keep reading order and essential content in the DOM so it remains understandable without CSS (WCAG 1.3.2 / RGAA 10.3).",
    nodes: toViolationNodes([hit]),
  };
}
