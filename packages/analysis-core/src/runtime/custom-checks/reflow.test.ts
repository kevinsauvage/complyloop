import { describe, expect, it } from "vitest";
import { isTwoDimensionalLayout } from "./reflow-exceptions";
import {
  elementWiderThanViewport,
  hasHorizontalOverflow,
  REFLOW_VIEWPORT,
} from "./reflow-math";

describe("reflow viewport constants", () => {
  it("uses the WCAG 320 CSS pixel width", () => {
    expect(REFLOW_VIEWPORT.width).toBe(320);
    expect(REFLOW_VIEWPORT.height).toBe(568);
  });
});

describe("hasHorizontalOverflow", () => {
  it("detects document-level horizontal scroll", () => {
    expect(hasHorizontalOverflow(400, 320)).toBe(true);
    expect(hasHorizontalOverflow(320, 320)).toBe(false);
  });
});

describe("elementWiderThanViewport", () => {
  it("flags elements wider than the reflow viewport", () => {
    expect(elementWiderThanViewport(800, 320)).toBe(true);
    expect(elementWiderThanViewport(300, 320)).toBe(false);
  });
});

describe("reflow exemptions", () => {
  it("delegates 2D layout detection to reflow-exceptions", () => {
    expect(isTwoDimensionalLayout("table", null)).toBe(true);
    expect(isTwoDimensionalLayout("div", null)).toBe(false);
  });
});
