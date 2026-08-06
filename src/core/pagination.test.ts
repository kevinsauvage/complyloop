import { describe, expect, it } from "vitest";
import { paginateSlice, parsePageParam } from "./pagination";

describe("parsePageParam", () => {
  it("defaults invalid values to page 1", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
  });

  it("parses positive integers", () => {
    expect(parsePageParam("3")).toBe(3);
    expect(parsePageParam(["2"])).toBe(2);
  });
});

describe("paginateSlice", () => {
  it("returns a bounded page and navigation flags", () => {
    const items = Array.from({ length: 60 }, (_, i) => i + 1);
    const page = paginateSlice(items, 2, 25);
    expect(page.items).toHaveLength(25);
    expect(page.items[0]).toBe(26);
    expect(page.total).toBe(60);
    expect(page.totalPages).toBe(3);
    expect(page.hasPrev).toBe(true);
    expect(page.hasNext).toBe(true);
  });

  it("clamps past the last page", () => {
    const page = paginateSlice([1, 2, 3], 99, 25);
    expect(page.page).toBe(1);
    expect(page.items).toEqual([1, 2, 3]);
    expect(page.hasNext).toBe(false);
  });
});
