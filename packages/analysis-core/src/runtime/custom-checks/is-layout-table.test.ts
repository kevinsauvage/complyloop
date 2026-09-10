import { describe, expect, it } from "vitest";
import {
  LAYOUT_TABLE_DATA_BODY,
  LAYOUT_TABLE_IMPLICIT_BODY,
  LAYOUT_TABLE_PRESENTATION_BODY,
} from "./layout-table-fixtures";
import { isLayoutTable, IS_LAYOUT_TABLE_SRC } from "./layout-table-linearization";

function tableFrom(html: string): HTMLTableElement {
  document.body.innerHTML = html;
  const table = document.querySelector("table");
  if (!(table instanceof HTMLTableElement)) {
    throw new Error("expected a table in fixture HTML");
  }
  return table;
}

describe("isLayoutTable", () => {
  it("treats role=presentation as a layout table", () => {
    expect(isLayoutTable(tableFrom(LAYOUT_TABLE_PRESENTATION_BODY))).toBe(true);
  });

  it("treats multi-cell tables without header markup as layout tables", () => {
    expect(isLayoutTable(tableFrom(LAYOUT_TABLE_IMPLICIT_BODY))).toBe(true);
  });

  it("rejects data tables with caption/thead/th/scope", () => {
    expect(isLayoutTable(tableFrom(LAYOUT_TABLE_DATA_BODY))).toBe(false);
  });

  it("exports a self-contained source for Playwright injection", () => {
    expect(IS_LAYOUT_TABLE_SRC).toContain("role");
    expect(IS_LAYOUT_TABLE_SRC).not.toMatch(/__vite_ssr_import_/);
    const reconstructed = new Function(
      `return (${IS_LAYOUT_TABLE_SRC})`,
    )() as typeof isLayoutTable;
    expect(reconstructed(tableFrom(LAYOUT_TABLE_PRESENTATION_BODY))).toBe(true);
    expect(reconstructed(tableFrom(LAYOUT_TABLE_DATA_BODY))).toBe(false);
  });
});
