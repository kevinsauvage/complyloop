import { describe, expect, it } from "vitest";

import { formatDateTimeWithZone } from "./datetime";

describe("formatDateTimeWithZone", () => {
  it("includes a zone qualifier so the instant is unambiguous", () => {
    const formatted = formatDateTimeWithZone("2024-06-15T14:30:00.000Z");
    expect(formatted).toMatch(/2024/);
    expect(formatted).toMatch(/GMT|UTC|[+-]\d{2}:?\d{2}|CET|CEST|BST/i);
  });
});
