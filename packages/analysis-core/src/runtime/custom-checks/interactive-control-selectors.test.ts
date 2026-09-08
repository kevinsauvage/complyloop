import { describe, expect, it } from "vitest";
import {
  ENHANCED_TARGET_CONTROL_SELECTOR,
  FORCED_COLORS_CONTROL_SELECTOR,
  NON_TEXT_CONTRAST_CONTROL_SELECTOR,
} from "./interactive-control-selectors";

/**
 * Which roles / hosts each probe includes (intentional divergence documented
 * in interactive-control-selectors.ts).
 */
describe("interactive control selectors", () => {
  it("non-text contrast includes checkable roles and hidden-input exclusion", () => {
    expect(NON_TEXT_CONTRAST_CONTROL_SELECTOR).toContain('[role="checkbox"]');
    expect(NON_TEXT_CONTRAST_CONTROL_SELECTOR).toContain('[role="radio"]');
    expect(NON_TEXT_CONTRAST_CONTROL_SELECTOR).toContain('input:not([type="hidden"])');
    expect(NON_TEXT_CONTRAST_CONTROL_SELECTOR).not.toContain('[role="switch"]');
  });

  it("enhanced target excludes UA-sized inputs and disabled hosts", () => {
    expect(ENHANCED_TARGET_CONTROL_SELECTOR).toContain("button:not([disabled])");
    expect(ENHANCED_TARGET_CONTROL_SELECTOR).toContain('not([type="checkbox"])');
    expect(ENHANCED_TARGET_CONTROL_SELECTOR).toContain('not([type="radio"])');
    expect(ENHANCED_TARGET_CONTROL_SELECTOR).toContain('not([type="file"])');
    expect(ENHANCED_TARGET_CONTROL_SELECTOR).toContain('not([type="range"])');
    expect(ENHANCED_TARGET_CONTROL_SELECTOR).not.toContain('[role="checkbox"]');
  });

  it("forced-colors includes switch/slider/textbox roles", () => {
    expect(FORCED_COLORS_CONTROL_SELECTOR).toContain('[role="switch"]');
    expect(FORCED_COLORS_CONTROL_SELECTOR).toContain('[role="slider"]');
    expect(FORCED_COLORS_CONTROL_SELECTOR).toContain('[role="textbox"]');
    expect(FORCED_COLORS_CONTROL_SELECTOR).toContain("a[href]");
  });
});
