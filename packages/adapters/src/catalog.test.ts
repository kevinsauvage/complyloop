import { describe, expect, it } from "vitest";
import { shippedCatalog } from "./catalog";

describe("shippedCatalog", () => {
  it("returns stable framework and control lists", () => {
    const first = shippedCatalog();
    const second = shippedCatalog();
    expect(first.frameworks.map((item) => item.id)).toEqual(
      second.frameworks.map((item) => item.id),
    );
    expect(first.controls.length).toBeGreaterThan(0);
    expect(first.controls.map((item) => item.id)).toEqual(
      second.controls.map((item) => item.id),
    );
  });
});
