import { describe, expect, it } from "vitest";

import { isOneOf, zeroCounts } from "./literal-sets";
import { REQUIREMENT_STATUSES } from "./statuses";

describe("isOneOf", () => {
  it("accepts only members of the set", () => {
    expect(isOneOf(REQUIREMENT_STATUSES, "passed")).toBe(true);
    expect(isOneOf(REQUIREMENT_STATUSES, "verified")).toBe(false);
    expect(isOneOf(REQUIREMENT_STATUSES, undefined)).toBe(false);
    expect(isOneOf(REQUIREMENT_STATUSES, 1)).toBe(false);
  });
});

describe("zeroCounts", () => {
  it("zeroes every literal", () => {
    expect(zeroCounts(["open", "resolved"])).toEqual({ open: 0, resolved: 0 });
  });
});
