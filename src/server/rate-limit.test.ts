import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type BucketRow = {
  key: string;
  windowStartedAt: string;
  count: number;
  updatedAt: string;
};

type Clause =
  | { kind: "eq"; value: unknown }
  | { kind: "lt"; value: unknown }
  | { kind: "and"; clauses: Clause[] };

const buckets = vi.hoisted(() => new Map<string, BucketRow>());
const getDrizzle = vi.hoisted(() => vi.fn());
const withNamedPostgresAdvisoryLock = vi.hoisted(() => vi.fn());

vi.mock("@complyloop/db/postgres", () => ({
  getDrizzle: () => getDrizzle(),
  withNamedPostgresAdvisoryLock: (
    drizzle: unknown,
    key: string,
    fn: (tx: unknown) => unknown,
  ) => withNamedPostgresAdvisoryLock(drizzle, key, fn),
}));

vi.mock("drizzle-orm", async () => {
  const actual =
    await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: (_column: unknown, value: unknown): Clause => ({ kind: "eq", value }),
    lt: (_column: unknown, value: unknown): Clause => ({ kind: "lt", value }),
    and: (...clauses: Clause[]): Clause => ({ kind: "and", clauses }),
  };
});

function createDrizzle() {
  return {
    select: () => ({
      from: () => ({
        where: (clause: Clause) => ({
          limit: async () => {
            if (clause.kind !== "eq") return [];
            const row = buckets.get(String(clause.value));
            return row ? [row] : [];
          },
        }),
      }),
    }),
    insert: () => ({
      values: (value: BucketRow) => ({
        onConflictDoUpdate: (options: { set: Partial<BucketRow> }) => {
          const existing = buckets.get(value.key);
          if (existing) {
            Object.assign(existing, options.set);
          } else {
            buckets.set(value.key, { ...value });
          }
          return Promise.resolve(undefined);
        },
      }),
    }),
    update: () => ({
      set: (patch: Partial<BucketRow>) => ({
        where: (clause: Clause) => ({
          returning: async () => {
            if (clause.kind !== "and") return [];
            const eqClause = clause.clauses.find((c) => c.kind === "eq");
            const ltClause = clause.clauses.find((c) => c.kind === "lt");
            if (
              !eqClause ||
              !ltClause ||
              eqClause.kind !== "eq" ||
              ltClause.kind !== "lt"
            ) {
              return [];
            }
            const row = buckets.get(String(eqClause.value));
            const limit = Number(ltClause.value);
            if (!row || row.count >= limit) return [];
            row.count += 1;
            if (typeof patch.updatedAt === "string") {
              row.updatedAt = patch.updatedAt;
            }
            return [{ key: row.key }];
          },
        }),
      }),
    }),
    delete: () => ({
      where: (clause: Clause) => ({
        returning: async () => {
          if (clause.kind !== "lt") return [];
          const cutoff = String(clause.value);
          const deleted: { key: string }[] = [];
          for (const [key, row] of buckets) {
            if (row.updatedAt < cutoff) {
              buckets.delete(key);
              deleted.push({ key });
            }
          }
          return deleted;
        },
      }),
    }),
  };
}

import {
  assertAiRateLimit,
  assertAssessRateLimit,
  assertConnectRateLimit,
  assertRateLimit,
  pruneRateLimitBuckets,
  RateLimitError,
} from "./rate-limit";

beforeEach(() => {
  buckets.clear();
  const drizzle = createDrizzle();
  getDrizzle.mockResolvedValue(drizzle);
  // Serialize lock holders so concurrent asserts behave like Postgres advisory locks.
  let chain: Promise<unknown> = Promise.resolve();
  withNamedPostgresAdvisoryLock.mockImplementation(
    async (_drizzle: unknown, _key: string, fn: (tx: unknown) => unknown) => {
      const run = chain.then(() => fn(drizzle));
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("RateLimitError", () => {
  it("is a public, retryable action error", () => {
    const error = new RateLimitError();
    expect(error.message).toMatch(/too many requests/i);
    expect(error.code).toBe("rate_limit");
  });
});

describe("assertRateLimit", () => {
  it("allows the first request in a window", async () => {
    await expect(assertRateLimit("k1", 2, 60_000)).resolves.toBeUndefined();
    expect(buckets.get("k1")?.count).toBe(1);
  });

  it("increments within an open window", async () => {
    await assertRateLimit("k1", 3, 60_000);
    await assertRateLimit("k1", 3, 60_000);
    expect(buckets.get("k1")?.count).toBe(2);
  });

  it("throws when the limit is exceeded", async () => {
    await assertRateLimit("k1", 1, 60_000);
    await expect(assertRateLimit("k1", 1, 60_000)).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it("resets after the window expires", async () => {
    await assertRateLimit("k1", 1, 1);
    const row = buckets.get("k1");
    if (!row) throw new Error("expected bucket");
    row.windowStartedAt = new Date(Date.now() - 1_000).toISOString();
    await expect(assertRateLimit("k1", 1, 1)).resolves.toBeUndefined();
    expect(buckets.get("k1")?.count).toBe(1);
  });

  it("allows exactly one of two concurrent writers when limit is 1", async () => {
    const results = await Promise.allSettled([
      assertRateLimit("concurrent", 1, 60_000),
      assertRateLimit("concurrent", 1, 60_000),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(
      rejected[0]?.status === "rejected" && rejected[0].reason,
    ).toBeInstanceOf(RateLimitError);
    expect(buckets.get("concurrent")?.count).toBe(1);
  });
});

describe("wrappers", () => {
  it("assertConnectRateLimit uses the connect key", async () => {
    await assertConnectRateLimit("user-1");
    expect(buckets.has("connect:user-1")).toBe(true);
    expect(withNamedPostgresAdvisoryLock).toHaveBeenCalledWith(
      expect.anything(),
      "rate-limit:connect:user-1",
      expect.any(Function),
    );
  });

  it("assertAssessRateLimit and assertAiRateLimit use their keys", async () => {
    await assertAssessRateLimit("user-1");
    await assertAiRateLimit("user-1");
    expect(buckets.has("assess:user-1")).toBe(true);
    expect(buckets.has("ai:user-1")).toBe(true);
  });
});

describe("pruneRateLimitBuckets", () => {
  it("deletes expired buckets", async () => {
    buckets.set("old", {
      key: "old",
      windowStartedAt: "2020-01-01T00:00:00.000Z",
      count: 1,
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    buckets.set("fresh", {
      key: "fresh",
      windowStartedAt: new Date().toISOString(),
      count: 1,
      updatedAt: new Date().toISOString(),
    });
    const deleted = await pruneRateLimitBuckets(86_400_000);
    expect(deleted).toBe(1);
    expect(buckets.has("old")).toBe(false);
    expect(buckets.has("fresh")).toBe(true);
  });
});
