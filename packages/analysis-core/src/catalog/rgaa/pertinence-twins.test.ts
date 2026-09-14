import { describe, expect, it } from "vitest";

import { isPertinenceTwinControl } from "./pertinence-twins";

describe("isPertinenceTwinControl", () => {
  it("covers the documented presence/pertinence pairs", () => {
    expect(isPertinenceTwinControl("ctl-img-alt-relevant")).toBe(true);
    expect(isPertinenceTwinControl("ctl-button-name-relevant")).toBe(true);
    expect(isPertinenceTwinControl("ctl-link-explicit")).toBe(true);
    expect(isPertinenceTwinControl("ctl-img-alt")).toBe(false);
  });
});
