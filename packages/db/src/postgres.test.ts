import { describe, expect, it, vi } from "vitest";

import type { DrizzleDb } from "./postgres.ts";
import {
  acquireNamedPostgresAdvisoryLock,
  isDatabaseSslInsecureEnabled,
  projectWriteLockKey,
  resolvePostgresSslOptions,
  withNamedPostgresAdvisoryLock,
} from "./postgres.ts";

describe("resolvePostgresSslOptions", () => {
  it("verifies certificates for sslmode=require by default", () => {
    expect(
      resolvePostgresSslOptions({
        sslmode: "require",
        hostname: "db.example.com",
        allowInsecureSsl: false,
      }),
    ).toEqual({
      rejectUnauthorized: true,
      servername: "db.example.com",
    });
  });

  it("allows an explicit insecure opt-in for require", () => {
    expect(
      resolvePostgresSslOptions({
        sslmode: "require",
        hostname: "db.example.com",
        allowInsecureSsl: true,
      }),
    ).toEqual({
      rejectUnauthorized: false,
      servername: "db.example.com",
    });
  });

  it("always verifies for verify-full even if insecure is requested", () => {
    expect(
      resolvePostgresSslOptions({
        sslmode: "verify-full",
        hostname: "db.example.com",
        allowInsecureSsl: true,
      }),
    ).toEqual({
      rejectUnauthorized: true,
      servername: "db.example.com",
    });
  });

  it("disables TLS for sslmode=disable", () => {
    expect(
      resolvePostgresSslOptions({
        sslmode: "disable",
        hostname: "localhost",
        allowInsecureSsl: false,
      }),
    ).toBeUndefined();
  });
});

describe("isDatabaseSslInsecureEnabled", () => {
  it("reads the documented env opt-in", () => {
    expect(isDatabaseSslInsecureEnabled({ DATABASE_SSL_INSECURE: "true" })).toBe(
      true,
    );
    expect(isDatabaseSslInsecureEnabled({ DATABASE_SSL_INSECURE: "0" })).toBe(
      false,
    );
  });
});

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
