import { describe, expect, it } from "vitest";
import { checkIdForAxeRule, mappedAxeRuleCount } from "./axe-map";

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
  });

  it("ignores unmapped axe rules", () => {
    expect(checkIdForAxeRule("totally-made-up-rule")).toBeUndefined();
  });

  it("covers a broader rule surface than the original ~37 mappings", () => {
    expect(mappedAxeRuleCount()).toBeGreaterThanOrEqual(60);
  });
});
