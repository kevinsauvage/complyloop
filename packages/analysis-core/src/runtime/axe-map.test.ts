import { describe, expect, it } from "vitest";
import { checkIdForAxeRule, mappedAxeRuleCount, REJECTED_AXE_RULES } from "./axe-map";

describe("axe-map", () => {
  it("maps high-value axe rules onto modeled checks", () => {
    expect(checkIdForAxeRule("no-autoplay-audio")).toBe("autoplay-media");
    expect(checkIdForAxeRule("svg-img-alt")).toBe("img-alt");
    expect(checkIdForAxeRule("skip-link")).toBe("bypass");
    expect(checkIdForAxeRule("meta-viewport")).toBe("meta-viewport");
    expect(checkIdForAxeRule("list")).toBe("list-structure");
    expect(checkIdForAxeRule("autocomplete-valid")).toBe("autocomplete-valid");
    expect(checkIdForAxeRule("link-in-text-block")).toBe("use-of-color");
    expect(checkIdForAxeRule("aria-dialog-name")).toBe("dialog-name");
    expect(checkIdForAxeRule("table-fake-caption")).toBe("table-caption");
    expect(checkIdForAxeRule("server-side-image-map")).toBe("img-alt");
    expect(checkIdForAxeRule("accesskeys")).toBe("no-accesskey");
    expect(checkIdForAxeRule("label-title-only")).toBe("input-label");
    expect(checkIdForAxeRule("landmark-banner-is-top-level")).toBe("landmark-one-main");
    expect(checkIdForAxeRule("landmark-contentinfo-is-top-level")).toBe("landmark-one-main");
    expect(checkIdForAxeRule("landmark-no-duplicate-banner")).toBe("landmark-unique");
    expect(checkIdForAxeRule("landmark-no-duplicate-contentinfo")).toBe("landmark-unique");
  });

  it("ignores unmapped axe rules", () => {
    expect(checkIdForAxeRule("totally-made-up-rule")).toBeUndefined();
    expect(checkIdForAxeRule("color-contrast-enhanced")).toBe(
      "color-contrast-enhanced",
    );
    expect(checkIdForAxeRule("table-duplicate-name")).toBe("table-caption");
    expect(checkIdForAxeRule("identical-links-same-purpose")).toBe(
      "identical-links-purpose",
    );
    expect(checkIdForAxeRule("hidden-content")).toBe("hidden-content");
    expect(checkIdForAxeRule("image-redundant-alt")).toBe("img-alt");
    expect(checkIdForAxeRule("aria-allowed-role")).toBe("aria-role");
    expect(checkIdForAxeRule("frame-tested")).toBe("frame-keyboard");
  });

  it("explicitly rejects deprecated and catalog-less best-practice rules", () => {
    expect(REJECTED_AXE_RULES.has("landmark-complementary-is-top-level")).toBe(
      true,
    );
    expect(REJECTED_AXE_RULES.has("aria-text")).toBe(true);
    expect(REJECTED_AXE_RULES.has("aria-treeitem-name")).toBe(true);
    expect(checkIdForAxeRule("landmark-complementary-is-top-level")).toBeUndefined();
    expect(checkIdForAxeRule("aria-text")).toBeUndefined();
    expect(checkIdForAxeRule("aria-treeitem-name")).toBeUndefined();
  });

  it("covers a broader rule surface than the original ~37 mappings", () => {
    expect(mappedAxeRuleCount()).toBeGreaterThanOrEqual(60);
  });
});
