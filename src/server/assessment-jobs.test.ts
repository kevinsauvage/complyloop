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
  | { kind: "in"; values: unknown[] }
  | { kind: "and"; parts: Clause[] };

const jobs = vi.hoisted(() => new Map<string, JobRow>());
const getDrizzle = vi.hoisted(() => vi.fn());
const withPostgresAdvisoryLock = vi.hoisted(() => vi.fn());

vi.mock("./db-store/client", () => ({
  getDrizzle: () => getDrizzle(),
}));

vi.mock("./db-store/write-lock", () => ({
  withPostgresAdvisoryLock: (
    drizzle: unknown,
    fn: (tx: unknown) => unknown,
  ) => withPostgresAdvisoryLock(drizzle, fn),
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
    and: (...parts: Clause[]): Clause => ({ kind: "and", parts }),
    inArray: (_column: unknown, values: unknown[]): Clause => ({
      kind: "in",
      values,
    }),
    asc: (column: unknown) => column,
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
  return {
    select: (shape?: { projectId?: unknown; id?: unknown }) => ({
      from: () => ({
        where: (clause: Clause) => {
          const eqs = eqValues(clause);
          const ins = inValues(clause);
          const ltes = lteValues(clause);
          const filtered = [...jobs.values()].filter((row) => {
            if (ins.length > 0) return ins.includes(row.status);
            if (eqs.includes(row.idempotencyKey)) return true;
            if (eqs.includes(row.projectId) && eqs.length === 1) return true;
            if (eqs.includes("running") && row.status === "running") return true;
            if (eqs.includes("queued") && row.status === "queued") {
              if (ltes.length === 0) return true;
              return row.availableAt <= String(ltes[0]);
            }
            return false;
          });
          const mapRows = () => {
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
              limit: async (n: number) => rows.slice(0, n),
            }),
          });
        },
      }),
    }),
    insert: () => ({
      values: (value: JobRow) => ({
        returning: async () => {
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
            if (eqs.includes(row.id) && eqs.includes(row.status)) {
              match = true;
            } else if (
              eqs.includes("running") &&
              row.status === "running" &&
              ltes.length > 0 &&
              row.leaseExpiresAt != null &&
              row.leaseExpiresAt <= String(ltes[0])
            ) {
              match = true;
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
}

import {
  cancelAssessmentJob,
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
  const drizzle = createDrizzle();
  getDrizzle.mockResolvedValue(drizzle);
  withPostgresAdvisoryLock.mockImplementation(
    async (_drizzle: unknown, fn: (tx: unknown) => unknown) => fn(drizzle),
  );
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
});

describe("completeAssessmentJob", () => {
  it("marks a running job as succeeded", async () => {
    const job = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "manual",
    });
    await claimNextAssessmentJob();
    await completeAssessmentJob(job.id);
    expect(jobs.get(job.id)?.status).toBe("succeeded");
    expect(jobs.get(job.id)?.completedAt).toBeTruthy();
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

describe("cancelAssessmentJob", () => {
  it("cancels a queued job", async () => {
    const job = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "manual",
    });
    await cancelAssessmentJob(job.id);
    expect(jobs.get(job.id)?.status).toBe("cancelled");
  });

  it("rejects cancelling a non-queued job", async () => {
    const job = await enqueueAssessmentJob({
      projectId: "p1",
      trigger: "manual",
    });
    await claimNextAssessmentJob();
    await expect(cancelAssessmentJob(job.id)).rejects.toThrow(
      /Only queued assessment jobs/,
    );
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
});
