import { describe, expect, it } from "vitest";
import { isTwoDimensionalLayout } from "./reflow";

describe("isTwoDimensionalLayout", () => {
  it("exempts data tables, grids, and maps", () => {
    expect(isTwoDimensionalLayout("table", null)).toBe(true);
    expect(isTwoDimensionalLayout("div", "grid")).toBe(true);
    expect(isTwoDimensionalLayout("div", "treegrid")).toBe(true);
    expect(isTwoDimensionalLayout("map", null)).toBe(true);
  });

  it("exempts images, diagrams, video, and code blocks", () => {
    expect(isTwoDimensionalLayout("img", null)).toBe(true);
    expect(isTwoDimensionalLayout("svg", null)).toBe(true);
    expect(isTwoDimensionalLayout("canvas", null)).toBe(true);
    expect(isTwoDimensionalLayout("video", null)).toBe(true);
    expect(isTwoDimensionalLayout("iframe", null)).toBe(true);
    expect(isTwoDimensionalLayout("pre", null)).toBe(true);
    expect(isTwoDimensionalLayout("div", "img")).toBe(true);
  });

  it("does not exempt ordinary layout containers", () => {
    expect(isTwoDimensionalLayout("div", null)).toBe(false);
    expect(isTwoDimensionalLayout("section", "region")).toBe(false);
    expect(isTwoDimensionalLayout("button", "button")).toBe(false);
  });
});
