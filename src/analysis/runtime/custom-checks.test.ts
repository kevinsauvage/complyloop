import { describe, expect, it } from "vitest";
import { checkIdForAxeRule } from "./axe-map";
import { findingsFromAxePages } from "./findings";

describe("custom runtime axe mappings", () => {
  it("maps complyloop synthetic rules to check ids", () => {
    expect(checkIdForAxeRule("complyloop-focus-visible")).toBe("focus-visible");
    expect(checkIdForAxeRule("complyloop-keyboard-trap")).toBe("keyboard-trap");
    expect(checkIdForAxeRule("complyloop-focus-not-obscured")).toBe(
      "focus-not-obscured",
    );
    expect(checkIdForAxeRule("complyloop-reflow")).toBe("reflow");
    expect(checkIdForAxeRule("complyloop-text-spacing-runtime")).toBe(
      "text-spacing-runtime",
    );
    expect(checkIdForAxeRule("complyloop-non-text-contrast")).toBe(
      "non-text-contrast",
    );
    expect(checkIdForAxeRule("complyloop-label-adjacent")).toBe("label-adjacent");
    expect(checkIdForAxeRule("complyloop-hover-content")).toBe("hover-content");
    expect(checkIdForAxeRule("complyloop-both-colors")).toBe("both-colors");
    expect(checkIdForAxeRule("complyloop-css-disabled-content")).toBe(
      "css-disabled-content",
    );
    expect(checkIdForAxeRule("complyloop-media-keyboard")).toBe("media-keyboard");
    expect(checkIdForAxeRule("complyloop-resize-text")).toBe("resize-text");
    expect(checkIdForAxeRule("complyloop-css-hover-keyboard")).toBe(
      "css-hover-keyboard",
    );
    expect(checkIdForAxeRule("complyloop-info-not-color-only")).toBe(
      "info-not-color-only",
    );
    expect(checkIdForAxeRule("complyloop-focus-order-logical")).toBe(
      "focus-order-logical",
    );
    expect(checkIdForAxeRule("complyloop-focus-not-obscured-enhanced")).toBe(
      "focus-not-obscured-enhanced",
    );
    expect(checkIdForAxeRule("complyloop-focus-appearance")).toBe(
      "focus-appearance",
    );
    expect(checkIdForAxeRule("identical-links-same-purpose")).toBe(
      "identical-links-purpose",
    );
    expect(checkIdForAxeRule("hidden-content")).toBe("hidden-content");
    expect(checkIdForAxeRule("html-lang-valid")).toBe("html-lang-valid");
  });

  it("builds findings from custom violations", () => {
    const findings = findingsFromAxePages([
      {
        url: "https://app.example/",
        violations: [
          {
            id: "complyloop-reflow",
            impact: "serious",
            description: "Horizontal scroll at 320px",
            help: "Content must reflow",
            nodes: [{ html: "<div>Wide</div>", target: ["div"] }],
          },
        ],
      },
    ]);
    expect(findings[0]?.checkId).toBe("reflow");
    expect(findings[0]?.engine).toBe("runtime");
  });
});
