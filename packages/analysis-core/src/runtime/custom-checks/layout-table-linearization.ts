import type { Page } from "playwright";
import type { CustomViolation } from "./types.js";

export async function layoutTableLinearizationViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const hit = await page.evaluate(() => {
    function selectorOf(el: Element): string {
      if (el.id) return `#${el.id}`;
      return el.tagName.toLowerCase();
    }

    function isLayoutTable(table: HTMLTableElement): boolean {
      if (table.getAttribute("role") === "presentation") return true;
      if (
        table.querySelector("th, caption, [headers], [scope], thead")
      ) {
        return false;
      }
      return table.querySelectorAll("td").length > 1;
    }

    function cellOrder(cells: HTMLElement[], byVisual: boolean): string[] {
      const ordered = byVisual
        ? [...cells].sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            const rowDelta = ra.top - rb.top;
            if (Math.abs(rowDelta) > 8) return rowDelta;
            return ra.left - rb.left;
          })
        : cells;
      return ordered.map((cell) =>
        (cell.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
      );
    }

    for (const table of document.querySelectorAll("table")) {
      if (!(table instanceof HTMLTableElement)) continue;
      if (!isLayoutTable(table)) continue;

      const cells = Array.from(table.querySelectorAll("td")).filter(
        (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement,
      );
      if (cells.length < 4) continue;

      const domOrder = cellOrder(cells, false);
      const visualOrder = cellOrder(cells, true);
      let mismatches = 0;
      for (let i = 0; i < domOrder.length; i += 1) {
        if (domOrder[i] !== visualOrder[i]) mismatches += 1;
      }
      if (mismatches < Math.ceil(cells.length / 3)) continue;

      const html = table.outerHTML.replace(/\s+/g, " ").trim();
      return {
        html: html.length > 200 ? `${html.slice(0, 197)}…` : html,
        selector: selectorOf(table),
        mismatches,
      };
    }

    return null;
  });

  if (!hit) return null;

  return {
    id: "complyloop-layout-table-linearization",
    impact: "moderate",
    description:
      "Layout table cells appear in a different visual order than DOM order, so disabling CSS will scramble reading order.",
    help: "Use CSS layout instead of reordering table cells, or mark up a real data table with headers (WCAG 1.3.2 / RGAA 5.3).",
    nodes: [{ html: hit.html, target: [hit.selector] }],
  };
}
