import { describe, expect, it } from "vitest";
import { isDismissalReason } from "./finding-types";

describe("isDismissalReason", () => {
  it("accepts valid dismissal reasons", () => {
    expect(isDismissalReason("false_positive")).toBe(true);
    expect(isDismissalReason("not_applicable")).toBe(true);
    expect(isDismissalReason("accepted_risk")).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isDismissalReason("compensating_control")).toBe(false);
    expect(isDismissalReason("")).toBe(false);
    expect(isDismissalReason(null)).toBe(false);
  });
});
