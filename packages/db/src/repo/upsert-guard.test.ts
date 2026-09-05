import { describe, expect, it } from "vitest";
import { filterNotStale, stampedNow } from "./upsert-guard.ts";

describe("filterNotStale", () => {
  it("keeps items when DB updatedAt matches loaded snapshot", () => {
    const kept = filterNotStale(
      [{ id: "a", updatedAt: "2020-01-02T00:00:00.000Z" }],
      new Map([["a", "2020-01-02T00:00:00.000Z"]]),
      new Map([["a", "2020-01-02T00:00:00.000Z"]]),
    );
    expect(kept).toHaveLength(1);
  });

  it("drops items when DB is newer than loaded snapshot", () => {
    const kept = filterNotStale(
      [{ id: "a", updatedAt: "2020-01-01T00:00:00.000Z" }],
      new Map([["a", "2020-01-01T00:00:00.000Z"]]),
      new Map([["a", "2020-01-02T00:00:00.000Z"]]),
    );
    expect(kept).toHaveLength(0);
  });

  it("writes unconditionally when loaded or DB timestamp is missing", () => {
    expect(
      filterNotStale(
        [{ id: "a" }],
        new Map(),
        new Map([["a", "2020-01-02T00:00:00.000Z"]]),
      ),
    ).toHaveLength(1);
    expect(
      filterNotStale(
        [{ id: "a", updatedAt: "2020-01-01T00:00:00.000Z" }],
        new Map([["a", "2020-01-01T00:00:00.000Z"]]),
        new Map(),
      ),
    ).toHaveLength(1);
  });
});

describe("stampedNow", () => {
  it("adds updatedAt", () => {
    const item = { id: "x" };
    const stamped = stampedNow(item);
    expect(stamped.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
