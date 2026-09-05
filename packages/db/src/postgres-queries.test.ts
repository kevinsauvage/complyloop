import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE } from "@complyloop/domain/project-types";
import { sqlPageOffset } from "./postgres-queries";

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
