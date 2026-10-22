import { describe, expect, it } from "vitest";

import { formatDateTimeWithZone } from "./datetime";

describe("formatDateTimeWithZone", () => {
  it("includes a zone qualifier so the instant is unambiguous", () => {
    const formatted = formatDateTimeWithZone("2024-06-15T14:30:00.000Z");
    expect(formatted).toMatch(/2024/);
    expect(formatted).toMatch(/GMT|UTC|[+-]\d{2}:?\d{2}|CET|CEST|BST/i);
  });
});

describe("formatDateTimeWithZone (UTC)", () => {
  it("prints the instant in UTC regardless of the process zone", () => {
    expect(formatDateTimeWithZone("2024-06-15T14:30:00.000Z", "UTC")).toBe(
      "15 Jun 2024, 14:30 (UTC+00:00)",
    );
  });
});
