import { describe, expect, it } from "vitest";
import { presetById } from "../registry.ts";

describe("WCAG preset tiers", () => {
  it("keeps AAA-only controls out of the AA preset", () => {
    const aa = presetById("preset-wcag-aa");
    expect(aa).toBeDefined();
    expect(aa?.controlIds).not.toContain("ctl-accessible-auth-enhanced");
    expect(aa?.controlIds).not.toContain("ctl-color-contrast-enhanced");
    expect(aa?.controlIds).not.toContain("ctl-reduced-motion");
    expect(aa?.controlIds).not.toContain("ctl-focus-not-obscured-enhanced");
    expect(aa?.controlIds).not.toContain("ctl-focus-appearance");
    expect(aa?.controlIds).not.toContain("ctl-target-size-enhanced");
    expect(aa?.controlIds).toContain("ctl-forced-colors");
  });

  it("includes AAA-tier controls in the extra-checks preset", () => {
    const extra = presetById("preset-wcag-aaa");
    expect(extra?.controlIds).toContain("ctl-accessible-auth-enhanced");
    expect(extra?.controlIds).toContain("ctl-color-contrast-enhanced");
    expect(extra?.controlIds).toContain("ctl-reduced-motion");
    expect(extra?.controlIds).toContain("ctl-target-size-enhanced");
    expect(extra?.controlIds).toContain("ctl-forced-colors");
  });

  it("includes new AA gap checks in the AA preset", () => {
    const aa = presetById("preset-wcag-aa");
    expect(aa?.controlIds).toContain("ctl-error-prevention");
    expect(aa?.controlIds).toContain("ctl-captcha-alternative");
    expect(aa?.controlIds).toContain("ctl-supplementary-content-keyboard");
    expect(aa?.controlIds).toContain("ctl-media-identification");
  });
});
