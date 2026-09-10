import type { Page } from "playwright";
import { pageEvaluateWithHitCapture } from "./hit-capture-evaluate.ts";
import type { CustomViolation } from "./types.ts";
import { selectorOf } from "./widget-keyboard-utils.ts";

/** True when the table is used for layout rather than tabular data. */
export function isLayoutTable(table: HTMLTableElement): boolean {
  // role="presentation" declares a layout table. Header markup makes it a data table.
  if (table.getAttribute("role") === "presentation") return true;
  if (table.querySelector("th, caption, [headers], [scope], thead")) {
    return false;
  }
  return table.querySelectorAll("td").length > 1;
}

/** Reconstruct with `new Function(\`return (${IS_LAYOUT_TABLE_SRC})\`)()`. */
export const IS_LAYOUT_TABLE_SRC = isLayoutTable.toString();

export async function layoutTableLinearizationViolation(
  page: Page,
): Promise<CustomViolation | null> {
  const hit = await pageEvaluateWithHitCapture(
    page,
    (captureHit, isLayoutTableSrc: string) => {
      const isLayoutTable = new Function(`return (${isLayoutTableSrc})`)() as (
        table: HTMLTableElement,
      ) => boolean;

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
          (cell): cell is HTMLTableCellElement =>
            cell instanceof HTMLTableCellElement,
        );
        if (cells.length < 4) continue;

        const domOrder = cellOrder(cells, false);
        const visualOrder = cellOrder(cells, true);
        let mismatches = 0;
        for (let i = 0; i < domOrder.length; i += 1) {
          if (domOrder[i] !== visualOrder[i]) mismatches += 1;
        }
        if (mismatches < Math.ceil(cells.length / 3)) continue;

        const captured = captureHit(table);
        return {
          html: captured.html,
          id: captured.id,
          role: captured.role,
          tagName: captured.tagName,
          mismatches,
        };
      }

      return null;
    },
    IS_LAYOUT_TABLE_SRC,
  );

  if (!hit) return null;

  return {
    id: "layout-table-linearization",
    impact: "moderate",
    description:
      "Layout table cells appear in a different visual order than DOM order, so disabling CSS will scramble reading order.",
    help: "Use CSS layout instead of reordering table cells, or mark up a real data table with headers (WCAG 1.3.2 / RGAA 5.3).",
    nodes: [{ html: hit.html, target: [selectorOf(hit)] }],
  };
}
