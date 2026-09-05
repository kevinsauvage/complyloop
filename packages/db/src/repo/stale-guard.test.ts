import { describe, expect, it } from "vitest";
import { filterItemsNotStaleInDb, stampedNow } from "./stale-guard.ts";

describe("filterItemsNotStaleInDb", () => {
  it("keeps writes when the DB timestamp is not newer than the load", () => {
    const kept = filterItemsNotStaleInDb(
      [{ id: "a", updatedAt: "2026-01-02T00:00:00.000Z" }],
      new Map([["a", "2026-01-02T00:00:00.000Z"]]),
      new Map([["a", "2026-01-01T00:00:00.000Z"]]),
    );
    expect(kept).toHaveLength(1);
  });

  it("drops writes when the DB row is newer than the loaded snapshot", () => {
    const kept = filterItemsNotStaleInDb(
      [{ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" }],
      new Map([["a", "2026-01-01T00:00:00.000Z"]]),
      new Map([["a", "2026-01-02T00:00:00.000Z"]]),
    );
    expect(kept).toEqual([]);
  });

  it("writes unconditionally when either timestamp is missing", () => {
    expect(
      filterItemsNotStaleInDb(
        [{ id: "a" }],
        new Map(),
        new Map([["a", "2026-01-02T00:00:00.000Z"]]),
      ),
    ).toHaveLength(1);
    expect(
      filterItemsNotStaleInDb(
        [{ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" }],
        new Map([["a", "2026-01-01T00:00:00.000Z"]]),
        new Map([["a", undefined]]),
      ),
    ).toHaveLength(1);
  });
});

describe("stampedNow", () => {
  it("sets updatedAt", () => {
    const item = { id: "a" };
    const stamped = stampedNow(item);
    expect(stamped.id).toBe("a");
    expect(Date.parse(stamped.updatedAt ?? "")).not.toBeNaN();
  });
});
