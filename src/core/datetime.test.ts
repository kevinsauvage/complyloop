import { describe, expect, it } from "vitest";

import { formatDateTime, formatDateTimeWithZone } from "./datetime";

describe("formatDateTime", () => {
  it("formats ISO timestamps with en-GB locale", () => {
    const formatted = formatDateTime("2024-06-15T14:30:00.000Z");
    expect(formatted).toMatch(/15/);
    expect(formatted).toMatch(/2024/);
  });
});

describe("formatDateTimeWithZone", () => {
  it("includes a zone qualifier so the instant is unambiguous", () => {
    const formatted = formatDateTimeWithZone("2024-06-15T14:30:00.000Z");
    expect(formatted).toMatch(/2024/);
    expect(formatted).toMatch(/GMT|UTC|[+-]\d{2}:?\d{2}|CET|CEST|BST/i);
  });
});
