import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  meetsNonTextContrast,
  parseRgb,
  relativeLuminance,
} from "./non-text-contrast-math";

describe("parseRgb", () => {
  it("parses rgb and rgba strings", () => {
    expect(parseRgb("rgb(0, 0, 0)")).toEqual([0, 0, 0]);
    expect(parseRgb("rgba(255, 255, 255, 0.5)")).toEqual([255, 255, 255]);
  });

  it("returns null for non-rgb values", () => {
    expect(parseRgb("transparent")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("returns 21:1 for black on white", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
  });

  it("is symmetric", () => {
    const a: [number, number, number] = [120, 120, 120];
    const b: [number, number, number] = [200, 200, 200];
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 5);
  });
});

describe("relativeLuminance", () => {
  it("ranks white higher than black", () => {
    expect(relativeLuminance([255, 255, 255])).toBeGreaterThan(
      relativeLuminance([0, 0, 0]),
    );
  });
});

describe("meetsNonTextContrast", () => {
  it("passes a strong border against white", () => {
    expect(meetsNonTextContrast("rgb(0, 0, 0)", "rgb(255, 255, 255)")).toBe(
      true,
    );
  });

  it("fails a low-contrast border", () => {
    expect(meetsNonTextContrast("rgb(220, 220, 220)", "rgb(255, 255, 255)")).toBe(
      false,
    );
  });

  it("returns null when colors cannot be parsed", () => {
    expect(meetsNonTextContrast("transparent", "rgb(255, 255, 255)")).toBeNull();
    expect(meetsNonTextContrast("rgb(0, 0, 0)", "currentColor")).toBeNull();
  });
});
