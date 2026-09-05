import { describe, expect, it, vi } from "vitest";
import type { DrizzleDb } from "./client.ts";
import {
  acquireNamedPostgresAdvisoryLock,
  projectWriteLockKey,
  withNamedPostgresAdvisoryLock,
} from "./write-lock.ts";

describe("projectWriteLockKey", () => {
  it("namespaces locks per project", () => {
    expect(projectWriteLockKey("p1")).toBe("project-write:p1");
  });
});

describe("acquireNamedPostgresAdvisoryLock", () => {
  it("requests a transaction-scoped advisory lock", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const tx = { execute } as unknown as DrizzleDb;

    await acquireNamedPostgresAdvisoryLock(tx, "project-write:p1");

    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]?.[0]).toBeTruthy();
  });
});

describe("withNamedPostgresAdvisoryLock", () => {
  it("runs the callback inside a locked transaction", async () => {
    const tx = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as DrizzleDb;
    const fn = vi.fn().mockResolvedValue("ok");
    const drizzle = {
      transaction: async (callback: (innerTx: DrizzleDb) => Promise<unknown>) =>
        callback(tx),
    } as unknown as DrizzleDb;

    await expect(
      withNamedPostgresAdvisoryLock(drizzle, "rate-limit:key", fn),
    ).resolves.toBe("ok");

    expect(tx.execute).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(tx);
  });
});
