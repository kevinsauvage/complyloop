import { describe, expect, it } from "vitest";
import { isDismissalReason } from "./finding-types";

describe("isDismissalReason", () => {
  it("accepts every valid dismissal reason", () => {
    expect(isDismissalReason("false_positive")).toBe(true);
    expect(isDismissalReason("not_applicable")).toBe(true);
    expect(isDismissalReason("accepted_risk")).toBe(true);
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isDismissalReason("banana")).toBe(false);
    expect(isDismissalReason("")).toBe(false);
    expect(isDismissalReason(42)).toBe(false);
    expect(isDismissalReason(null)).toBe(false);
    expect(isDismissalReason(undefined)).toBe(false);
  });
});