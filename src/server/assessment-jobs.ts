import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { PublicError } from "@/core/public-error";
import { getDrizzle, type DrizzleDb } from "./db-store/client";
import { assessmentJobs } from "./db-store/schema";
import { withPostgresAdvisoryLock } from "./db-store/write-lock";

export type AssessmentJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";
export type AssessmentJobTrigger = "manual" | "webhook";

export interface AssessmentJobPayload {
  ref?: string;
  eventName?: "push" | "pull_request";
  pullRequestHeadSha?: string;
}

export interface AssessmentJob {
  id: string;
  projectId: string;
  status: AssessmentJobStatus;
  trigger: AssessmentJobTrigger;
  requestedByUserId?: string;
  idempotencyKey?: string;
  payload: AssessmentJobPayload;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  startedAt?: string;
  leaseExpiresAt?: string;
  completedAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

type AssessmentJobRow = typeof assessmentJobs.$inferSelect;

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_MS = 30 * 60_000;
const RETRY_BASE_MS = 30_000;

function jobFromRow(row: AssessmentJobRow): AssessmentJob {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status as AssessmentJobStatus,
    trigger: row.trigger as AssessmentJobTrigger,
    requestedByUserId: row.requestedByUserId ?? undefined,
    idempotencyKey: row.idempotencyKey ?? undefined,
    payload: row.payload as AssessmentJobPayload,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    availableAt: row.availableAt,
    startedAt: row.startedAt ?? undefined,
    leaseExpiresAt: row.leaseExpiresAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface EnqueueAssessmentJobInput {
  projectId: string;
  trigger: AssessmentJobTrigger;
  requestedByUserId?: string | null;
  idempotencyKey?: string;
  payload?: AssessmentJobPayload;
}

/**
 * Enqueues a new assessment. An idempotency key returns the original job when
 * a webhook is delivered more than once or a request is retried.
 */
export async function enqueueAssessmentJob(
  input: EnqueueAssessmentJobInput,
): Promise<AssessmentJob> {
  const drizzle = await getDrizzle();
  return withPostgresAdvisoryLock(drizzle, async (tx) => {
    if (input.idempotencyKey) {
      const [existing] = await tx
        .select()
        .from(assessmentJobs)
        .where(eq(assessmentJobs.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing) return jobFromRow(existing);
    }

    const now = new Date().toISOString();
    const [created] = await tx
      .insert(assessmentJobs)
      .values({
        id: crypto.randomUUID(),
        projectId: input.projectId,
        status: "queued",
        trigger: input.trigger,
        requestedByUserId: input.requestedByUserId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        payload: { ...(input.payload ?? {}) },
        attempts: 0,
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        availableAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!created) throw new Error("Could not enqueue assessment job.");
    return jobFromRow(created);
  });
}

async function recoverExpiredLeases(tx: DrizzleDb, now: string): Promise<void> {
  await tx
    .update(assessmentJobs)
    .set({
      status: "queued",
      availableAt: now,
      leaseExpiresAt: null,
      updatedAt: now,
      error: "Worker lease expired; retrying.",
    })
    .where(
      and(
        eq(assessmentJobs.status, "running"),
        lte(assessmentJobs.leaseExpiresAt, now),
      ),
    );
}

/** Claims one ready job while ensuring only one assessment runs per project. */
export async function claimNextAssessmentJob(): Promise<AssessmentJob | null> {
  const drizzle = await getDrizzle();
  return withPostgresAdvisoryLock(drizzle, async (tx) => {
    const now = new Date().toISOString();
    await recoverExpiredLeases(tx, now);

    const running = await tx
      .select({ projectId: assessmentJobs.projectId })
      .from(assessmentJobs)
      .where(eq(assessmentJobs.status, "running"));
    const runningProjectIds = new Set(running.map((job) => job.projectId));
    const ready = await tx
      .select()
      .from(assessmentJobs)
      .where(
        and(
          eq(assessmentJobs.status, "queued"),
          lte(assessmentJobs.availableAt, now),
        ),
      )
      .orderBy(asc(assessmentJobs.availableAt), asc(assessmentJobs.createdAt))
      .limit(100);
    const candidate = ready.find((job) => !runningProjectIds.has(job.projectId));
    if (!candidate) return null;

    const leaseExpiresAt = new Date(Date.now() + DEFAULT_LEASE_MS).toISOString();
    const [claimed] = await tx
      .update(assessmentJobs)
      .set({
        status: "running",
        attempts: candidate.attempts + 1,
        startedAt: now,
        leaseExpiresAt,
        error: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(assessmentJobs.id, candidate.id),
          eq(assessmentJobs.status, "queued"),
        ),
      )
      .returning();
    return claimed ? jobFromRow(claimed) : null;
  });
}

export async function completeAssessmentJob(id: string): Promise<void> {
  const drizzle = await getDrizzle();
  const now = new Date().toISOString();
  await drizzle
    .update(assessmentJobs)
    .set({
      status: "succeeded",
      completedAt: now,
      leaseExpiresAt: null,
      error: null,
      updatedAt: now,
    })
    .where(and(eq(assessmentJobs.id, id), eq(assessmentJobs.status, "running")));
}

export async function failAssessmentJob(
  job: AssessmentJob,
  error: unknown,
): Promise<AssessmentJobStatus> {
  const drizzle = await getDrizzle();
  const now = new Date();
  const message = error instanceof Error ? error.message : "Assessment job failed.";
  const terminal = job.attempts >= job.maxAttempts;
  const status: AssessmentJobStatus = terminal ? "failed" : "queued";
  const delay = RETRY_BASE_MS * 2 ** Math.max(0, job.attempts - 1);
  await drizzle
    .update(assessmentJobs)
    .set({
      status,
      availableAt: terminal
        ? now.toISOString()
        : new Date(now.getTime() + delay).toISOString(),
      completedAt: terminal ? now.toISOString() : null,
      leaseExpiresAt: null,
      error: message.slice(0, 2_000),
      updatedAt: now.toISOString(),
    })
    .where(and(eq(assessmentJobs.id, job.id), eq(assessmentJobs.status, "running")));
  return status;
}

export async function cancelAssessmentJob(id: string): Promise<void> {
  const drizzle = await getDrizzle();
  const now = new Date().toISOString();
  const cancelled = await drizzle
    .update(assessmentJobs)
    .set({ status: "cancelled", completedAt: now, updatedAt: now })
    .where(and(eq(assessmentJobs.id, id), eq(assessmentJobs.status, "queued")))
    .returning({ id: assessmentJobs.id });
  if (cancelled.length === 0) {
    throw new PublicError("Only queued assessment jobs can be cancelled.");
  }
}

export async function recentAssessmentJobsForProject(
  projectId: string,
  limit = 5,
): Promise<AssessmentJob[]> {
  const drizzle = await getDrizzle();
  const rows = await drizzle
    .select()
    .from(assessmentJobs)
    .where(eq(assessmentJobs.projectId, projectId))
    .orderBy(asc(assessmentJobs.createdAt))
    .limit(limit);
  return rows.reverse().map(jobFromRow);
}

export async function queuedAssessmentJobCount(): Promise<number> {
  const drizzle = await getDrizzle();
  const rows = await drizzle
    .select({ id: assessmentJobs.id })
    .from(assessmentJobs)
    .where(inArray(assessmentJobs.status, ["queued", "running"]));
  return rows.length;
}
