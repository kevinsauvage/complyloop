import { and, count, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { getDrizzle, type DrizzleDb } from "@complyloop/db/client";
import { assessmentJobs } from "@complyloop/db/schema";
import {
  ASSESSMENT_JOB_STATUSES,
  ASSESSMENT_JOB_TRIGGERS,
  type AssessmentJobStatus,
  type AssessmentJobTrigger,
} from "@complyloop/analysis-core/contract/assessment-jobs";

export type { AssessmentJobStatus, AssessmentJobTrigger } from "@complyloop/analysis-core/contract/assessment-jobs";

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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function parseJobStatus(value: string): AssessmentJobStatus {
  for (const status of ASSESSMENT_JOB_STATUSES) {
    if (status === value) return status;
  }
  throw new Error(`Unexpected assessment job status: ${value}`);
}

function parseJobTrigger(value: string): AssessmentJobTrigger {
  for (const trigger of ASSESSMENT_JOB_TRIGGERS) {
    if (trigger === value) return trigger;
  }
  throw new Error(`Unexpected assessment job trigger: ${value}`);
}

function parseJobPayload(value: unknown): AssessmentJobPayload {
  if (!isPlainObject(value)) {
    return {};
  }
  const payload: AssessmentJobPayload = {};
  if (typeof value.ref === "string") payload.ref = value.ref;
  if (value.eventName === "push" || value.eventName === "pull_request") {
    payload.eventName = value.eventName;
  }
  if (typeof value.pullRequestHeadSha === "string") {
    payload.pullRequestHeadSha = value.pullRequestHeadSha;
  }
  return payload;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jobFromRow(row: AssessmentJobRow): AssessmentJob {
  return {
    id: row.id,
    projectId: row.projectId,
    status: parseJobStatus(row.status),
    trigger: parseJobTrigger(row.trigger),
    requestedByUserId: row.requestedByUserId ?? undefined,
    idempotencyKey: row.idempotencyKey ?? undefined,
    payload: parseJobPayload(row.payload),
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
  if (input.idempotencyKey) {
    const [existing] = await drizzle
      .select()
      .from(assessmentJobs)
      .where(eq(assessmentJobs.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) return jobFromRow(existing);
  }

  const now = new Date().toISOString();
  try {
    const [created] = await drizzle
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
  } catch (error) {
    if (input.idempotencyKey && isUniqueViolation(error)) {
      const [existing] = await drizzle
        .select()
        .from(assessmentJobs)
        .where(eq(assessmentJobs.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing) return jobFromRow(existing);
    }
    throw error;
  }
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
  return drizzle.transaction(async (tx) => {
    const now = new Date().toISOString();
    await recoverExpiredLeases(tx, now);

    const locked = await tx.execute<{ id: string }>(sql`
      SELECT id
      FROM assessment_jobs
      WHERE status = 'queued'
        AND available_at <= ${now}
        AND project_id NOT IN (
          SELECT project_id
          FROM assessment_jobs
          WHERE status = 'running'
        )
      ORDER BY available_at ASC, created_at ASC
      LIMIT 100
      FOR UPDATE SKIP LOCKED
    `);
    const lockedIds = [...locked].map((row) => String(row.id));
    if (lockedIds.length === 0) return null;

    const ready = await tx
      .select()
      .from(assessmentJobs)
      .where(inArray(assessmentJobs.id, lockedIds));
    const byId = new Map(ready.map((job) => [job.id, job]));
    const candidate = lockedIds
      .map((id) => byId.get(id))
      .find((job) => job !== undefined);
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
    .orderBy(desc(assessmentJobs.createdAt))
    .limit(limit);
  return rows.map(jobFromRow);
}

export async function queuedAssessmentJobCount(): Promise<number> {
  const drizzle = await getDrizzle();
  const [row] = await drizzle
    .select({ value: count() })
    .from(assessmentJobs)
    .where(inArray(assessmentJobs.status, ["queued", "running"]));
  return Number(row?.value ?? 0);
}
