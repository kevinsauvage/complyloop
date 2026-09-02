import { describe, expect, it } from "vitest";
import { formatDateTime } from "./format-datetime";

describe("formatDateTime", () => {
  it("formats ISO timestamps with en-GB locale", () => {
    const formatted = formatDateTime("2024-06-15T14:30:00.000Z");
    expect(formatted).toMatch(/15/);
    expect(formatted).toMatch(/2024/);
  });
});
