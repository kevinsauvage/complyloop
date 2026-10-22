import { describe, expect, it } from "vitest";

import { stampedNow, upsertPayloadRows } from "./upsert-guard.ts";

describe("stampedNow", () => {
  it("adds updatedAt", () => {
    const item = { id: "x" };
    const stamped = stampedNow(item);
    expect(stamped.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("overwrites an existing updatedAt", () => {
    const stamped = stampedNow({
      id: "x",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    expect(stamped.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
  });
});

describe("upsertPayloadRows", () => {
  it("is a no-op with no items", async () => {
    const write = async () => {
      throw new Error("write must not run");
    };
    await upsertPayloadRows([], (item) => item, write);
  });

  // The contract this module's docs state: `updatedAt` is a last-write stamp,
  // not a guard. Safe serialisation comes from the per-project advisory lock.
  it("writes rows unconditionally, even when their updatedAt is older", async () => {
    let written: Array<{ id: string; updatedAt: string }> = [];
    await upsertPayloadRows(
      [{ id: "a", updatedAt: "2000-01-01T00:00:00.000Z" }],
      (item) => item,
      async (rows) => {
        written = rows;
      },
    );
    expect(written).toHaveLength(1);
    expect(Date.parse(written[0]!.updatedAt)).toBeGreaterThan(
      Date.parse("2000-01-01T00:00:00.000Z"),
    );
  });

  it("stamps every row before mapping and writing", async () => {
    const written: Array<{ id: string; updatedAt?: string }> = [];
    await upsertPayloadRows(
      [{ id: "a" }, { id: "b" }],
      (item) => item,
      async (rows) => {
        written.push(...rows);
      },
    );
    expect(written.map((row) => row.id)).toEqual(["a", "b"]);
    for (const row of written) {
      expect(row.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});
