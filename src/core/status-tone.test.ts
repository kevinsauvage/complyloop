import { describe, expect, it } from "vitest";
import { REQUIREMENT_STATUS_DISPLAY_ORDER } from "@complyloop/analysis-core/contract/statuses";
import { roleTone, statusTone } from "./status-tone";

describe("statusTone", () => {
  it("maps every requirement status", () => {
    expect(REQUIREMENT_STATUS_DISPLAY_ORDER.map(statusTone)).toEqual([
      "failed",
      "review",
      "passed",
      "na",
      "unverifiable",
    ]);
  });
});

describe("roleTone", () => {
  it("maps every org role", () => {
    expect(roleTone("owner")).toBe("signal");
    expect(roleTone("admin")).toBe("review");
    expect(roleTone("member")).toBe("passed");
    expect(roleTone("viewer")).toBe("na");
  });
});
