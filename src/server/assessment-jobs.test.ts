import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type JobRow = {
  id: string;
  projectId: string;
  status: string;
  trigger: string;
  requestedByUserId: string | null;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  startedAt: string | null;
  leaseExpiresAt: string | null;
  completedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

type Clause =
  | { kind: "eq"; value: unknown }
  | { kind: "lte"; value: unknown }
  | { kind: "lt"; value: unknown }
  | { kind: "gte"; value: unknown }
  | { kind: "in"; values: unknown[] }
  | { kind: "and"; parts: Clause[] };

const jobs = vi.hoisted(() => new Map<string, JobRow>());
const getDrizzle = vi.hoisted(() => vi.fn());
const reportWarning = vi.hoisted(() => vi.fn());
// When set, the next insert throws instead (simulates a concurrent writer
// winning the race for the same idempotency key).
const insertThrow = vi.hoisted(() => ({ error: null as unknown }));

vi.mock("@complyloop/db/postgres", () => ({
  getDrizzle: () => getDrizzle(),
}));

vi.mock("./observability", () => ({
  reportWarning: (...args: unknown[]) => reportWarning(...args),
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>(
    "drizzle-orm",
  );
  return {
    ...actual,
    eq: (_column: unknown, value: unknown): Clause => ({ kind: "eq", value }),
    lte: (_column: unknown, value: unknown): Clause => ({
      kind: "lte",
      value,
    }),
    // Column-to-column comparisons (attempts vs maxAttempts) arrive with a
    // non-number value; numeric values compare against row.attempts.
    lt: (_column: unknown, value: unknown): Clause => ({ kind: "lt", value }),
    gte: (_column: unknown, value: unknown): Clause => ({
      kind: "gte",
      value,
    }),
    and: (...parts: Clause[]): Clause => ({ kind: "and", parts }),
    inArray: (_column: unknown, values: unknown[]): Clause => ({
      kind: "in",
      values,
    }),
    asc: (column: unknown) => column,
    desc: (column: unknown) => column,
    count: () => ({ value: "count" }),
  };
});

function flatten(clause: Clause | undefined): Clause[] {
  if (!clause) return [];
  if (clause.kind === "and") return clause.parts.flatMap(flatten);
  return [clause];
}

function eqValues(clause: Clause | undefined): unknown[] {
  return flatten(clause)
    .filter((part): part is Extract<Clause, { kind: "eq" }> => part.kind === "eq")
    .map((part) => part.value);
}

function inValues(clause: Clause | undefined): unknown[] {
  return flatten(clause)
    .filter((part): part is Extract<Clause, { kind: "in" }> => part.kind === "in")
    .flatMap((part) => part.values);
}

function lteValues(clause: Clause | undefined): unknown[] {
  return flatten(clause)
    .filter((part): part is Extract<Clause, { kind: "lte" }> => part.kind === "lte")
    .map((part) => part.value);
}

function createDrizzle() {
  const drizzle = {
    execute: async () => {
      const runningProjectIds = new Set(
        [...jobs.values()]
          .filter((row) => row.status === "running")
          .map((row) => row.projectId),
      );
      return [...jobs.values()]
        .filter(
          (row) =>
            row.status === "queued" &&
            row.availableAt <= new Date().toISOString() &&
            !runningProjectIds.has(row.projectId),
        )
        .sort((a, b) =>
          a.availableAt === b.availableAt
            ? a.createdAt.localeCompare(b.createdAt)
            : a.availableAt.localeCompare(b.availableAt),
        )
        .slice(0, 1)
        .map((row) => ({ id: row.id }));
    },
    select: (shape?: { projectId?: unknown; id?: unknown }) => ({
      from: () => ({
        where: (clause: Clause) => {
          const eqs = eqValues(clause);
          const ins = inValues(clause);
          const ltes = lteValues(clause);
          const filtered = [...jobs.values()].filter((row) => {
            if (eqs.includes(row.id)) return true;
            if (ins.length > 0) {
              return ins.includes(row.status) || ins.includes(row.id);
            }
            if (eqs.includes(row.idempotencyKey)) return true;
            if (eqs.includes(row.projectId) && eqs.length === 1) return true;
            if (eqs.includes("running") && row.status === "running") return true;
            // Webhook-coalescing lookup: project + queued + webhook trigger.
            if (eqs.includes(row.projectId) && eqs.includes("webhook")) {
              return row.status === "queued" && row.trigger === "webhook";
            }
            if (eqs.includes("queued") && row.status === "queued") {
              if (ltes.length === 0) return true;
              return row.availableAt <= String(ltes[0]);
            }
            return false;
          });
          const mapRows = () => {
            if (shape && "value" in shape) {
              return [{ value: filtered.length }];
            }
            if (shape && "projectId" in shape) {
              return filtered.map((row) => ({ projectId: row.projectId }));
            }
            if (shape && "id" in shape) {
              return filtered.map((row) => ({ id: row.id }));
            }
            return filtered;
          };
          const rows = mapRows();
          return Object.assign(Promise.resolve(rows), {
            limit: async (n: number) => rows.slice(0, n),
            orderBy: () => ({
              limit: async (n: number) =>
                [...filtered]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .slice(0, n),
            }),
          });
        },
      }),
    }),
    insert: () => ({
      values: (value: JobRow) => ({
        returning: async () => {
          if (insertThrow.error) {
            const error = insertThrow.error;
            insertThrow.error = null;
            throw error;
          }
          const row = { ...value };
          jobs.set(row.id, row);
          return [row];
        },
      }),
    }),
    update: () => ({
      set: (patch: Partial<JobRow>) => ({
        where: (clause: Clause) => {
          const eqs = eqValues(clause);
          const ltes = lteValues(clause);
          const updated: JobRow[] = [];
          for (const [id, row] of jobs) {
            let match = false;
            const hasId = eqs.includes(row.id);
            const hasStatus = eqs.includes(row.status);
            const hasLease = eqs.includes(row.leaseExpiresAt);
            const hasStarted = eqs.includes(row.startedAt);
            if (eqs.length === 2 && hasId && hasStatus && !hasLease && !hasStarted) {
              match = true;
            } else if (
              eqs.length === 4 &&
              hasId &&
              hasStatus &&
              hasLease &&
              hasStarted
            ) {
              match = true;
            } else if (
              hasStatus &&
              eqs.includes("running") &&
              ltes.length > 0 &&
              row.leaseExpiresAt != null &&
              row.leaseExpiresAt <= String(ltes[0])
            ) {
              // Lease-recovery updates carry lt/gte on attempts vs maxAttempts
              // (column value, not a number). Updates without them match as before.
              const bounds = flatten(clause).filter(
                (part) => part.kind === "lt" || part.kind === "gte",
              );
              match = bounds.every((part) => {
                const limit =
                  typeof part.value === "number"
                    ? part.value
                    : row.maxAttempts;
                return part.kind === "lt"
                  ? row.attempts < limit
                  : row.attempts >= limit;
              });
            }
            if (!match) continue;
            const next = { ...row, ...patch } as JobRow;
            jobs.set(id, next);
            updated.push(next);
          }
          const thenable = Promise.resolve(undefined);
          return Object.assign(thenable, {
            returning: async (returningShape?: { id?: unknown }) => {
              if (returningShape && "id" in returningShape) {
                return updated.map((row) => ({ id: row.id }));
              }
              return updated;
            },
          });
        },
      }),
    }),
  };
  return {
    ...drizzle,
    transaction: async (fn: (tx: typeof drizzle) => unknown) => fn(drizzle),
  };
}

import {
  claimNextAssessmentJob,
  completeAssessmentJob,
  enqueueAssessmentJob,
  failAssessmentJob,
  queuedAssessmentJobCount,
  recentAssessmentJobsForProject,
  type AssessmentJob,
} from "./assessment-jobs";

beforeEach(() => {
  jobs.clear();
  getDrizzle.mockResolvedValue(createDrizzle());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("enqueueAssessmentJob", () => {
  it("creates a queued job", async () => {
    const job = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "manual",
      requestedByUserId: "user-1",
    });
    expect(job.status).toBe("queued");
    expect(job.projectId).toBe("p1");
    expect(job.attempts).toBe(0);
    expect(jobs.size).toBe(1);
  });

  it("returns the existing job for an idempotency key", async () => {
    const first = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "webhook",
      idempotencyKey: "delivery-1",
    });
    const second = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "webhook",
      idempotencyKey: "delivery-1",
    });
    expect(second.id).toBe(first.id);
    expect(jobs.size).toBe(1);
  });
});

describe("claimNextAssessmentJob", () => {
  it("returns null when the queue is empty", async () => {
    expect(await claimNextAssessmentJob()).toBeNull();
  });

  it("claims the oldest ready job", async () => {
    await enqueueAssessmentJob({ projectId: "p1", trigger: "manual" });
    const claimed = await claimNextAssessmentJob();
    expect(claimed?.status).toBe("running");
    expect(claimed?.attempts).toBe(1);
    expect(claimed?.leaseExpiresAt).toBeTruthy();
  });

  it("skips projects that already have a running job", async () => {
    const first = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "manual",
    });
    await claimNextAssessmentJob();
    await enqueueAssessmentJob({ projectId: "p1", trigger: "manual" });
    await enqueueAssessmentJob({ projectId: "p2", trigger: "manual" });

    const claimed = await claimNextAssessmentJob();
    expect(claimed?.projectId).toBe("p2");
    expect(jobs.get(first.id)?.status).toBe("running");
  });

  it("claims a free project beyond queued jobs blocked by running projects", async () => {
    const running = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "manual",
    });
    await claimNextAssessmentJob();
    // Fill more than the 100-row lock window with jobs for the running project.
    for (let index = 0; index < 110; index += 1) {
      await enqueueAssessmentJob({
        projectId: "p1",
        trigger: "webhook",
        idempotencyKey: `blocked-${index}`,
      });
    }
    await enqueueAssessmentJob({ projectId: "p2", trigger: "manual" });

    const claimed = await claimNextAssessmentJob();
    expect(claimed?.projectId).toBe("p2");
    expect(jobs.get(running.id)?.status).toBe("running");
  });

  it("requeues jobs whose lease expired", async () => {
    const job = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "manual",
    });
    const row = jobs.get(job.id);
    if (!row) throw new Error("expected job");
    row.status = "running";
    row.leaseExpiresAt = new Date(Date.now() - 60_000).toISOString();
    row.attempts = 1;

    const claimed = await claimNextAssessmentJob();
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe("running");
    expect(claimed?.attempts).toBe(2);
  });

  it("fails expired leases that exhausted their attempts instead of resurrecting them", async () => {
    const job = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "manual",
    });
    const row = jobs.get(job.id);
    if (!row) throw new Error("expected job");
    row.status = "running";
    row.leaseExpiresAt = new Date(Date.now() - 60_000).toISOString();
    row.attempts = 3;
    row.maxAttempts = 3;

    expect(await claimNextAssessmentJob()).toBeNull();
    expect(jobs.get(job.id)?.status).toBe("failed");
    expect(jobs.get(job.id)?.error).toMatch(/repeatedly/);
  });

  it("coalesces rapid webhook enqueues into the pending job", async () => {
    const first = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "webhook",
      idempotencyKey: "delivery-1",
      payload: { ref: "a".repeat(40), eventName: "push" },
    });
    const second = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "webhook",
      idempotencyKey: "delivery-2",
      payload: { ref: "b".repeat(40), eventName: "push" },
    });
    // Newest SHA wins; the oldest idempotency key is retained.
    expect(second.id).toBe(first.id);
    expect(jobs.size).toBe(1);
    expect(second.payload).toMatchObject({ ref: "b".repeat(40) });
    expect(second.idempotencyKey).toBe("delivery-1");
  });

  it("does not coalesce manual jobs or running webhook jobs", async () => {
    const manual1 = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "manual",
    });
    const manual2 = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "manual",
    });
    expect(manual2.id).not.toBe(manual1.id);

    const webhook1 = await enqueueAssessmentJob({
      projectId: "p9",
      trigger: "webhook",
      payload: { ref: "a".repeat(40) },
    });
    const running = jobs.get(webhook1.id);
    if (!running) throw new Error("expected job");
    running.status = "running";
    const webhook2 = await enqueueAssessmentJob({
      projectId: "p9",
      trigger: "webhook",
      payload: { ref: "b".repeat(40) },
    });
    expect(webhook2.id).not.toBe(webhook1.id);
  });

  it("falls back to an empty payload for garbage stored payloads", async () => {    const now = new Date().toISOString();
    jobs.set("job-garbage", {
      id: "job-garbage",
      projectId: "p1",
      status: "queued",
      trigger: "manual",
      requestedByUserId: null,
      idempotencyKey: null,
      // Simulates a row written before payload validation existed.
      payload: "not-a-payload" as unknown as Record<string, unknown>,
      attempts: 0,
      maxAttempts: 3,
      availableAt: now,
      startedAt: null,
      leaseExpiresAt: null,
      completedAt: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    });
    const [job] = await recentAssessmentJobsForProject("p1", 5);
    expect(job?.payload).toEqual({});
  });

  it("rejects rows with an unknown status", async () => {
    const now = new Date().toISOString();
    jobs.set("job-bogus", {
      id: "job-bogus",
      projectId: "p1",
      status: "bogus",
      trigger: "manual",
      requestedByUserId: null,
      idempotencyKey: null,
      payload: {},
      attempts: 0,
      maxAttempts: 3,
      availableAt: now,
      startedAt: null,
      leaseExpiresAt: null,
      completedAt: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    });
    await expect(recentAssessmentJobsForProject("p1", 5)).rejects.toThrow(
      /Unexpected assessment job status/,
    );
  });

  it("returns the concurrent winner on unique-violation races", async () => {
    const now = new Date().toISOString();
    jobs.set("job-winner", {
      id: "job-winner",
      projectId: "p1",
      status: "queued",
      trigger: "webhook",
      requestedByUserId: null,
      idempotencyKey: "delivery-race",
      payload: { ref: "a".repeat(40) },
      attempts: 0,
      maxAttempts: 3,
      availableAt: now,
      startedAt: null,
      leaseExpiresAt: null,
      completedAt: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    });
    // The pre-insert idempotency check misses (row lands concurrently), the
    // insert hits the unique constraint, the recovery select finds the winner.
    insertThrow.error = { code: "23505" };
    const job = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "manual",
      idempotencyKey: "delivery-race",
    });
    expect(job.id).toBe("job-winner");
  });

  it("rethrows non-unique insert failures", async () => {
    insertThrow.error = new Error("connection lost");
    await expect(
      enqueueAssessmentJob({ projectId: "p1", trigger: "manual" }),
    ).rejects.toThrow(/connection lost/);
  });

  it("warns on a stale-lease fail write", async () => {
    const job = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "manual",
    });
    const claimed = await claimNextAssessmentJob();
    if (!claimed) throw new Error("expected claim");
    jobs.delete(job.id);
    const status = await failAssessmentJob(claimed, new Error("boom"));
    expect(status).toBe("queued");
    expect(reportWarning).toHaveBeenCalledWith(
      "Stale lease write rejected for assessment job",
      expect.objectContaining({ jobId: job.id }),
    );
  });
});

describe("completeAssessmentJob", () => {
  it("marks a running job as succeeded", async () => {
    const job = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "manual",
    });
    const claimed = await claimNextAssessmentJob();
    if (!claimed) throw new Error("expected claim");
    await completeAssessmentJob(claimed);
    expect(jobs.get(job.id)?.status).toBe("succeeded");
    expect(jobs.get(job.id)?.completedAt).toBeTruthy();
  });

  it("rejects a stale lease complete", async () => {
    const job = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "manual",
    });
    const first = await claimNextAssessmentJob();
    if (!first) throw new Error("expected first claim");
    const row = jobs.get(job.id);
    if (!row) throw new Error("expected row");
    row.status = "queued";
    row.leaseExpiresAt = null;
    row.attempts = 1;
    first.leaseExpiresAt = "2026-01-01T01:00:00.000Z";
    first.startedAt = "2026-01-01T00:00:00.000Z";
    const second = await claimNextAssessmentJob();
    if (!second) throw new Error("expected second claim");
    await completeAssessmentJob(first);
    const updated = jobs.get(job.id);
    expect(updated?.status).toBe("running");
    expect(updated?.attempts).toBe(2);
    expect(updated?.leaseExpiresAt).toBe(second.leaseExpiresAt);
  });
});

describe("failAssessmentJob", () => {
  it("requeues when attempts remain", async () => {
    const job = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "manual",
    });
    const claimed = await claimNextAssessmentJob();
    if (!claimed) throw new Error("expected claim");
    const status = await failAssessmentJob(claimed, new Error("boom"));
    expect(status).toBe("queued");
    expect(jobs.get(job.id)?.status).toBe("queued");
    expect(jobs.get(job.id)?.error).toBe("boom");
  });

  it("fails terminally when max attempts are exhausted", async () => {
    const job = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "manual",
    });
    const row = jobs.get(job.id);
    if (!row) throw new Error("expected job");
    row.attempts = row.maxAttempts;
    row.status = "running";
    const running: AssessmentJob = {
      id: job.id,
      projectId: job.projectId,
      status: "running",
      trigger: job.trigger,
      payload: {},
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      availableAt: job.availableAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
    const status = await failAssessmentJob(running, "hard fail");
    expect(status).toBe("failed");
    expect(jobs.get(job.id)?.status).toBe("failed");
  });
});

describe("queuedAssessmentJobCount and recentAssessmentJobsForProject", () => {
  it("counts queued and running jobs", async () => {
    await enqueueAssessmentJob({ projectId: "p1", trigger: "manual" });
    await enqueueAssessmentJob({ projectId: "p2", trigger: "manual" });
    await claimNextAssessmentJob();
    expect(await queuedAssessmentJobCount()).toBe(2);
  });

  it("lists recent jobs for a project", async () => {
    await enqueueAssessmentJob({ projectId: "p1", trigger: "manual" });
    await enqueueAssessmentJob({ projectId: "p1", trigger: "webhook" });
    await enqueueAssessmentJob({ projectId: "p2", trigger: "manual" });
    const recent = await recentAssessmentJobsForProject("p1", 5);
    expect(recent).toHaveLength(2);
    expect(recent.every((job) => job.projectId === "p1")).toBe(true);
  });

  it("lists the newest jobs when more than the limit exist", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const job = await enqueueAssessmentJob({
        projectId: "p1",
        trigger: "manual",
        idempotencyKey: `recent-${i}`,
      });
      const row = jobs.get(job.id);
      if (row) {
        row.createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
      }
      ids.push(job.id);
    }
    const recent = await recentAssessmentJobsForProject("p1", 5);
    expect(recent.map((job) => job.id)).toEqual(ids.slice(-5).reverse());
  });
});
