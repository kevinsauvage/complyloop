import { describe, expect, it } from "vitest";

import { parseCssColor } from "./css-color";

describe("parseCssColor", () => {
  it("parses legacy comma syntax", () => {
    expect(parseCssColor("rgb(0, 0, 0)")).toEqual({
      rgb: [0, 0, 0],
      alpha: 1,
    });
    expect(parseCssColor("rgba(255, 255, 255, 0.5)")).toEqual({
      rgb: [255, 255, 255],
      alpha: 0.5,
    });
    expect(parseCssColor("rgb(100%, 0%, 0%)")).toEqual({
      rgb: [255, 0, 0],
      alpha: 1,
    });
  });

  it("parses hex and the transparent keyword", () => {
    expect(parseCssColor("#fff")?.rgb).toEqual([255, 255, 255]);
    expect(parseCssColor("#09090b")?.rgb).toEqual([9, 9, 11]);
    expect(parseCssColor("transparent")).toEqual({
      rgb: [0, 0, 0],
      alpha: 0,
    });
  });

  it("parses space-separated syntax with slash alpha", () => {
    expect(parseCssColor("rgb(255 0 0)")?.rgb).toEqual([255, 0, 0]);
    expect(parseCssColor("rgb(39 39 42 / 0.5)")).toEqual({
      rgb: [39, 39, 42],
      alpha: 0.5,
    });
    expect(parseCssColor("rgba(9 9 11 / 50%)")).toEqual({
      rgb: [9, 9, 11],
      alpha: 0.5,
    });
  });

  it("converts lab() to sRGB (white/black/mid-gray anchors)", () => {
    expect(parseCssColor("lab(100% 0 0)")?.rgb).toEqual([255, 255, 255]);
    expect(parseCssColor("lab(0% 0 0)")?.rgb).toEqual([0, 0, 0]);
    // CSS Color 4 reference: 50% lightness neutral gray ≈ #777.
    const [r, g, b] = parseCssColor("lab(50% 0 0)")?.rgb ?? [0, 0, 0];
    expect(Math.abs(r - 119)).toBeLessThanOrEqual(3);
    expect(Math.abs(g - 119)).toBeLessThanOrEqual(3);
    expect(Math.abs(b - 119)).toBeLessThanOrEqual(3);
  });

  it("converts a saturated lab() red near sRGB red", () => {
    // CSS Color 4 spec example: this lab triple displays as red.
    const [r, g, b] = parseCssColor("lab(52.2319% 80.1093 67.2201)")?.rgb ?? [
      0, 0, 0,
    ];
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(100);
    expect(b).toBeLessThan(100);
  });

  it("converts oklab() white/black/gray", () => {
    expect(parseCssColor("oklab(1 0 0)")?.rgb).toEqual([255, 255, 255]);
    expect(parseCssColor("oklab(0 0 0)")?.rgb).toEqual([0, 0, 0]);
    const [r, g, b] = parseCssColor("oklab(0.5 0 0)")?.rgb ?? [0, 0, 0];
    expect(Math.abs(r - 99)).toBeLessThanOrEqual(6);
    expect(Math.abs(g - 99)).toBeLessThanOrEqual(6);
    expect(Math.abs(b - 99)).toBeLessThanOrEqual(6);
  });

  it("parses color(srgb) and rejects wide-gamut spaces", () => {
    expect(parseCssColor("color(srgb 1 0 0)")).toEqual({
      rgb: [255, 0, 0],
      alpha: 1,
    });
    expect(parseCssColor("color(srgb 1 1 1 / 0)")).toEqual({
      rgb: [255, 255, 255],
      alpha: 0,
    });
    expect(parseCssColor("color(display-p3 1 0 0)")).toBeNull();
  });

  it("rejects currentcolor, hue spaces, and garbage", () => {
    expect(parseCssColor("currentcolor")).toBeNull();
    expect(parseCssColor("hsl(0, 100%, 50%)")).toBeNull();
    expect(parseCssColor("lch(50% 50 180)")).toBeNull();
    expect(parseCssColor("not-a-color")).toBeNull();
    expect(parseCssColor("")).toBeNull();
  });
});
