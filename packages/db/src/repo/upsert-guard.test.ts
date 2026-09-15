import { describe, expect, it, vi } from "vitest";

import {
  filterNotStale,
  filterStalePayloadWrites,
  stampedNow,
} from "./upsert-guard.ts";

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

describe("filterStalePayloadWrites", () => {
  it("returns a copy without fetching when there is no loaded snapshot", async () => {
    const items = [{ id: "a", updatedAt: "2020-01-01T00:00:00.000Z" }];
    const fetchDb = vi.fn();
    const kept = await filterStalePayloadWrites(items, undefined, fetchDb);
    expect(kept).toEqual(items);
    expect(kept).not.toBe(items);
    expect(fetchDb).not.toHaveBeenCalled();
  });

  it("fetches DB timestamps and drops stale rows", async () => {
    const items = [
      { id: "a", updatedAt: "2020-01-01T00:00:00.000Z" },
      { id: "b", updatedAt: "2020-01-01T00:00:00.000Z" },
    ];
    const fetchDb = vi.fn(
      async () =>
        new Map<string, string | undefined>([
          ["a", "2020-01-02T00:00:00.000Z"],
          ["b", "2020-01-01T00:00:00.000Z"],
        ]),
    );
    const kept = await filterStalePayloadWrites(
      items,
      new Map([
        ["a", "2020-01-01T00:00:00.000Z"],
        ["b", "2020-01-01T00:00:00.000Z"],
      ]),
      fetchDb,
    );
    expect(fetchDb).toHaveBeenCalledWith(["a", "b"]);
    expect(kept).toEqual([{ id: "b", updatedAt: "2020-01-01T00:00:00.000Z" }]);
  });
});

describe("stampedNow", () => {
  it("adds updatedAt", () => {
    const item = { id: "x" };
    const stamped = stampedNow(item);
    expect(stamped.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
