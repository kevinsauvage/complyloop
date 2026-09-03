import { describe, expect, it } from "vitest";
import {
  checkIdForIbmRule,
  ibmMappedCheckIds,
  REJECTED_IBM_RULES,
} from "./ibm-map";

describe("ibm-map", () => {
  it("maps curated IBM rules to catalog check ids", () => {
    expect(checkIdForIbmRule("aria_content_in_landmark")).toBe("content-region");
    expect(checkIdForIbmRule("heading_markup_misuse")).toBe("p-as-heading");
    expect(checkIdForIbmRule("unknown_rule")).toBeUndefined();
  });

  it("rejects IBM focus, target-size twins, and axe-duplicated rules", () => {
    expect(REJECTED_IBM_RULES.has("style_focus_visible")).toBe(true);
    expect(REJECTED_IBM_RULES.has("target_spacing_sufficient")).toBe(true);
    expect(REJECTED_IBM_RULES.has("a_text_purpose")).toBe(true);
    expect(REJECTED_IBM_RULES.has("html_skipnav_exists")).toBe(true);
    expect(REJECTED_IBM_RULES.has("input_label_visible")).toBe(true);
    expect(checkIdForIbmRule("style_focus_visible")).toBeUndefined();
    expect(checkIdForIbmRule("target_spacing_sufficient")).toBeUndefined();
    expect(checkIdForIbmRule("a_text_purpose")).toBeUndefined();
  });

  it("exports distinct mapped check ids", () => {
    const ids = ibmMappedCheckIds();
    expect(ids.length).toBeGreaterThan(5);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
