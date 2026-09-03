import { describe, expect, it } from "vitest";
import {
  gapBetweenRects,
  labelGapExceedsThreshold,
  MAX_LABEL_GAP_PX,
} from "./label-adjacent-math";

describe("gapBetweenRects", () => {
  it("returns zero when rects overlap", () => {
    expect(gapBetweenRects(
      { left: 0, right: 100, top: 0, bottom: 20 },
      { left: 10, right: 90, top: 5, bottom: 15 },
    )).toBe(0);
  });

  it("measures horizontal separation", () => {
    expect(gapBetweenRects(
      { left: 0, right: 80, top: 0, bottom: 20 },
      { left: 100, right: 200, top: 0, bottom: 20 },
    )).toBe(20);
  });

  it("measures vertical separation for stacked labels", () => {
    expect(gapBetweenRects(
      { left: 0, right: 100, top: 0, bottom: 20 },
      { left: 0, right: 100, top: 28, bottom: 48 },
    )).toBe(8);
  });
});

describe("labelGapExceedsThreshold", () => {
  it(`passes when gap is within ${MAX_LABEL_GAP_PX}px`, () => {
    expect(labelGapExceedsThreshold(
      { left: 0, right: 80, top: 0, bottom: 20 },
      { left: 120, right: 200, top: 0, bottom: 20 },
    )).toBe(false);
  });

  it("flags when gap exceeds the threshold", () => {
    expect(labelGapExceedsThreshold(
      { left: 0, right: 80, top: 0, bottom: 20 },
      { left: 200, right: 280, top: 0, bottom: 20 },
    )).toBe(true);
  });

  it("ignores zero-width rects", () => {
    expect(labelGapExceedsThreshold(
      { left: 0, right: 0, top: 0, bottom: 20 },
      { left: 200, right: 280, top: 0, bottom: 20 },
    )).toBe(false);
  });
});
