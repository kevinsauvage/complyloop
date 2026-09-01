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
  });

  it("builds findings from custom violations", () => {
    const findings = findingsFromAxePages([
      {
        url: "https://app.example/",
        violations: [
          {
            id: "complyloop-focus-visible",
            impact: "serious",
            description: "No focus indicator",
            help: "Keyboard users must see focus",
            nodes: [{ html: "<button>Go</button>", target: ["button"] }],
          },
        ],
      },
    ]);
    expect(findings[0]?.checkId).toBe("focus-visible");
    expect(findings[0]?.engine).toBe("runtime");
  });
});
