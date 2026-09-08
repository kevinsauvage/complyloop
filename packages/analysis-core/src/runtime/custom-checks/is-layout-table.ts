/**
 * Leaf browser helper — no imports, close over nothing.
 * Stringified into Playwright evaluate payloads via {@link IS_LAYOUT_TABLE_SRC}.
 */

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
