import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE } from "@complyloop/analysis-core/contract/project-types";
import { evidenceExportWindow, sqlPageOffset } from "./postgres-queries";

describe("sqlPageOffset", () => {
  it("maps 1-based pages to zero-based offsets", () => {
    expect(sqlPageOffset(1, DEFAULT_PAGE_SIZE)).toBe(0);
    expect(sqlPageOffset(2, DEFAULT_PAGE_SIZE)).toBe(DEFAULT_PAGE_SIZE);
    expect(sqlPageOffset(3, 10)).toBe(20);
  });

  it("clamps invalid pages to the first page", () => {
    expect(sqlPageOffset(0, 25)).toBe(0);
    expect(sqlPageOffset(-2, 25)).toBe(0);
  });
});

describe("evidenceExportWindow", () => {
  it("is not truncated when the table is within the limit", () => {
    expect(evidenceExportWindow(12, 5_000)).toEqual({
      take: 12,
      truncated: false,
    });
  });

  it("caps at the limit and marks the export truncated", () => {
    expect(evidenceExportWindow(12_001, 5_000)).toEqual({
      take: 5_000,
      truncated: true,
    });
  });
});
