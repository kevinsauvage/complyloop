import { describe, expect, it } from "vitest";

import { isSuspectedKeyboardTrap } from "./focus";

describe("isSuspectedKeyboardTrap", () => {
  it("detects cycling between two focus targets", () => {
    const sequence = Array.from({ length: 16 }, (_, index) =>
      index % 2 === 0 ? "#a" : "#b",
    );
    expect(isSuspectedKeyboardTrap(sequence)).toBe(true);
  });

  it("passes when focus reaches many distinct elements", () => {
    const sequence = ["#a", "#b", "#c", "#d", "#e", "#f"];
    expect(isSuspectedKeyboardTrap(sequence)).toBe(false);
  });

  it("ignores intentional modal traps", () => {
    expect(isSuspectedKeyboardTrap(["#a", "modal", "#a", "modal"])).toBe(false);
  });
});
