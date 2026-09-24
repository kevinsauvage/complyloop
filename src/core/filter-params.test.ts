import { describe, expect, it } from "vitest";

import {
  findingDetailHref,
  findingsListHref,
  hasActiveFindingFilters,
  pageSliceFromQuery,
  paginateSlice,
  parsePageParam,
} from "./filter-params";

/**
 * Barrel test for `@/core/filter-params`: pagination clamping and href
 * shape. The underlying modules are covered transitively — this pins the
 * canonical entry point plus the boundary behavior list pages rely on.
 */
describe("filter-params barrel", () => {
  it("parses page params with a floor of 1", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("3")).toBe(3);
    expect(parsePageParam("2.9")).toBe(2);
    expect(parsePageParam(["2"])).toBe(2);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-2")).toBe(1);
    expect(parsePageParam("bogus")).toBe(1);
  });

  it("clamps paginated slices to the last page", () => {
    const items = ["a", "b", "c"];
    const first = paginateSlice(items, 1, 2);
    expect(first.items).toEqual(["a", "b"]);
    expect(first.hasNext).toBe(true);
    expect(first.hasPrev).toBe(false);
    const clamped = paginateSlice(items, 99, 2);
    expect(clamped.page).toBe(2);
    expect(clamped.items).toEqual(["c"]);
    expect(clamped.hasNext).toBe(false);
    expect(clamped.hasPrev).toBe(true);
  });

  it("passes query slices through untouched", () => {
    const slice = pageSliceFromQuery(["a"], 1, 3, 2);
    expect(slice.items).toEqual(["a"]);
    expect(slice.total).toBe(3);
    expect(slice.totalPages).toBe(2);
  });

  it("builds findings hrefs with list context", () => {
    expect(findingsListHref()).toBe("/findings");
    expect(findingsListHref({ tab: "resolved" })).toContain("tab=resolved");
    const detail = findingDetailHref("f-1", {
      tab: "open",
      page: 2,
    });
    expect(detail.startsWith("/findings/f-1?")).toBe(true);
    expect(detail).toContain("page=2");
  });

  it("detects active finding filters", () => {
    expect(hasActiveFindingFilters({})).toBe(false);
    expect(hasActiveFindingFilters({ q: "alt" })).toBe(true);
    expect(hasActiveFindingFilters({ severity: "serious" })).toBe(true);
  });
});
