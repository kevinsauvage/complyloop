import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  sql,
} from "drizzle-orm";

import { isUniqueViolation } from "../pg-errors.ts";
import type { DrizzleDb } from "../postgres.ts";
import { assessmentJobs } from "../schema.ts";

/**
 * Durable assessment queue rows. Policy (payload parsing, retry backoff,
 * coalescing rules, in-flight bookkeeping) lives in
 * `src/server/assessment/assessment-jobs.ts`; this module only reads and
 * writes rows.
 */
export type AssessmentJobRow = typeof assessmentJobs.$inferSelect;
export type NewAssessmentJobRow = typeof assessmentJobs.$inferInsert;

/** The claim-time pair every lease-guarded write must still match. */
export interface AssessmentJobLease {
  id: string;
  leaseExpiresAt: string;
  startedAt: string;
}

function leaseMatches(lease: AssessmentJobLease) {
  return and(
    eq(assessmentJobs.id, lease.id),
    eq(assessmentJobs.status, "running"),
    eq(assessmentJobs.leaseExpiresAt, lease.leaseExpiresAt),
    eq(assessmentJobs.startedAt, lease.startedAt),
  );
}

export async function findAssessmentJobByIdempotencyKey(
  drizzle: DrizzleDb,
  idempotencyKey: string,
): Promise<AssessmentJobRow | undefined> {
  const [row] = await drizzle
    .select()
    .from(assessmentJobs)
    .where(eq(assessmentJobs.idempotencyKey, idempotencyKey))
    .limit(1);
  return row;
}

/** Oldest still-queued job of one trigger for a project (coalescing target). */
export async function findOldestQueuedAssessmentJob(
  drizzle: DrizzleDb,
  projectId: string,
  trigger: string,
): Promise<AssessmentJobRow | undefined> {
  const [row] = await drizzle
    .select()
    .from(assessmentJobs)
    .where(
      and(
        eq(assessmentJobs.projectId, projectId),
        eq(assessmentJobs.status, "queued"),
        eq(assessmentJobs.trigger, trigger),
      ),
    )
    .orderBy(asc(assessmentJobs.createdAt))
    .limit(1);
  return row;
}

/**
 * Refreshes a job only while it is still `queued`. Undefined when a worker
 * claimed it concurrently, so the caller can enqueue instead of dropping the
 * request.
 */
export async function refreshQueuedAssessmentJob(
  drizzle: DrizzleDb,
  id: string,
  set: Partial<
    Pick<NewAssessmentJobRow, "payload" | "availableAt" | "updatedAt">
  >,
): Promise<AssessmentJobRow | undefined> {
  const [updated] = await drizzle
    .update(assessmentJobs)
    .set(set)
    .where(and(eq(assessmentJobs.id, id), eq(assessmentJobs.status, "queued")))
    .returning();
  return updated;
}

/**
 * Inserts a job. With an idempotency key, a concurrent insert of the same key
 * loses to the unique index and gets the winning row back.
 */
export async function insertAssessmentJob(
  drizzle: DrizzleDb,
  row: NewAssessmentJobRow,
): Promise<AssessmentJobRow> {
  try {
    const [created] = await drizzle
      .insert(assessmentJobs)
      .values(row)
      .returning();
    if (!created) throw new Error("Could not enqueue assessment job.");
    return created;
  } catch (error) {
    if (row.idempotencyKey && isUniqueViolation(error)) {
      const existing = await findAssessmentJobByIdempotencyKey(
        drizzle,
        row.idempotencyKey,
      );
      if (existing) return existing;
    }
    throw error;
  }
}

/**
 * Leases expire when a worker crashes mid-run. Requeue only while attempts
 * remain; a poison job (OOM, crash loop) at max attempts is terminal instead
 * of being resurrected on every claim tick forever.
 */
export async function recoverExpiredAssessmentJobLeases(
  tx: DrizzleDb,
  now: string,
): Promise<void> {
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
        lt(assessmentJobs.attempts, assessmentJobs.maxAttempts),
      ),
    );
  await tx
    .update(assessmentJobs)
    .set({
      status: "failed",
      completedAt: now,
      leaseExpiresAt: null,
      updatedAt: now,
      error: "Worker lease expired repeatedly; giving up.",
    })
    .where(
      and(
        eq(assessmentJobs.status, "running"),
        lte(assessmentJobs.leaseExpiresAt, now),
        gte(assessmentJobs.attempts, assessmentJobs.maxAttempts),
      ),
    );
}

/**
 * Claims one ready job (inside the caller's transaction) while keeping one
 * assessment per project. Single-row claim: lock exactly the job we will run;
 * the correlated NOT EXISTS keeps one running job per project without
 * rescanning the table (served by assessment_jobs_ready_idx +
 * assessment_jobs_project_idx). The UPDATE re-checks NOT EXISTS, and the
 * partial unique index assessment_jobs_running_project_uidx is the real
 * backstop: under READ COMMITTED two workers claiming different queued jobs
 * for the same project can both see "no running", so the loser gets 23505.
 * Null when nothing is ready or the race was lost.
 */
export async function claimNextAssessmentJobRow(
  tx: DrizzleDb,
  now: string,
  leaseExpiresAt: string,
): Promise<AssessmentJobRow | null> {
  const locked = await tx.execute<{
    id: string;
    attempts: number;
    project_id: string;
  }>(sql`
    SELECT job.id AS id, job.attempts AS attempts, job.project_id AS project_id
    FROM assessment_jobs AS job
    WHERE job.status = 'queued'
      AND job.available_at <= ${now}
      AND NOT EXISTS (
        SELECT 1
        FROM assessment_jobs AS running
        WHERE running.status = 'running'
          AND running.project_id = job.project_id
      )
    ORDER BY job.available_at ASC, job.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `);
  const [row] = [...locked];
  if (!row) return null;
  const candidateId = String(row.id);
  const candidateProjectId = String(row.project_id);

  try {
    const [claimed] = await tx
      .update(assessmentJobs)
      .set({
        status: "running",
        attempts: Number(row.attempts) + 1,
        startedAt: now,
        leaseExpiresAt,
        error: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(assessmentJobs.id, candidateId),
          eq(assessmentJobs.status, "queued"),
          sql`NOT EXISTS (
            SELECT 1 FROM assessment_jobs AS running
            WHERE running.status = 'running'
              AND running.project_id = ${candidateProjectId}
              AND running.id <> ${candidateId}
          )`,
        ),
      )
      .returning();
    return claimed ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

/** Terminal failure without a retry (e.g. a payload no worker may run). */
export async function failAssessmentJobTerminally(
  drizzle: DrizzleDb,
  id: string,
  error: string,
  now: string,
): Promise<void> {
  await drizzle
    .update(assessmentJobs)
    .set({
      status: "failed",
      completedAt: now,
      leaseExpiresAt: null,
      updatedAt: now,
      error,
    })
    .where(eq(assessmentJobs.id, id));
}

/**
 * Hands `running` jobs back to the queue, or fails those out of attempts.
 * Returns how many rows moved.
 */
export async function releaseRunningAssessmentJobs(
  drizzle: DrizzleDb,
  ids: readonly string[],
  error: string,
  now: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  const released = await drizzle
    .update(assessmentJobs)
    .set({
      status: sql`case when ${assessmentJobs.attempts} >= ${assessmentJobs.maxAttempts} then 'failed' else 'queued' end`,
      availableAt: now,
      completedAt: sql`case when ${assessmentJobs.attempts} >= ${assessmentJobs.maxAttempts} then ${now}::timestamptz else null end`,
      leaseExpiresAt: null,
      error,
      updatedAt: now,
    })
    .where(
      and(
        inArray(assessmentJobs.id, [...ids]),
        eq(assessmentJobs.status, "running"),
      ),
    )
    .returning({ id: assessmentJobs.id });
  return released.length;
}

/**
 * Settles a running job if the caller still holds its lease. False means the
 * lease is stale (cancelled, reaped or re-claimed) and nothing was written.
 */
export async function settleAssessmentJob(
  drizzle: DrizzleDb,
  lease: AssessmentJobLease,
  set: Partial<
    Pick<
      NewAssessmentJobRow,
      "status" | "availableAt" | "completedAt" | "error"
    >
  >,
  now: string,
): Promise<boolean> {
  const result = await drizzle
    .update(assessmentJobs)
    .set({ ...set, leaseExpiresAt: null, updatedAt: now })
    .where(leaseMatches(lease))
    .returning({ id: assessmentJobs.id });
  return result.length > 0;
}

/** Extends a held lease. Null when the job left `running` or the lease moved. */
export async function renewAssessmentJobLease(
  drizzle: DrizzleDb,
  lease: AssessmentJobLease,
  leaseExpiresAt: string,
  now: string,
): Promise<string | null> {
  const [refreshed] = await drizzle
    .update(assessmentJobs)
    .set({ leaseExpiresAt, updatedAt: now })
    .where(leaseMatches(lease))
    .returning({ leaseExpiresAt: assessmentJobs.leaseExpiresAt });
  return refreshed?.leaseExpiresAt ?? null;
}

export async function listRecentAssessmentJobs(
  drizzle: DrizzleDb,
  projectId: string,
  limit: number,
): Promise<AssessmentJobRow[]> {
  return drizzle
    .select()
    .from(assessmentJobs)
    .where(eq(assessmentJobs.projectId, projectId))
    .orderBy(desc(assessmentJobs.createdAt))
    .limit(limit);
}

/** The newest job of one trigger for a project, in any state. */
export async function findNewestAssessmentJob(
  drizzle: DrizzleDb,
  projectId: string,
  trigger: string,
): Promise<AssessmentJobRow | undefined> {
  const [row] = await drizzle
    .select()
    .from(assessmentJobs)
    .where(
      and(
        eq(assessmentJobs.projectId, projectId),
        eq(assessmentJobs.trigger, trigger),
      ),
    )
    .orderBy(desc(assessmentJobs.createdAt))
    .limit(1);
  return row;
}

/** A project's `queued`/`running` jobs (bounded; callers pick the oldest). */
export async function listActiveAssessmentJobs(
  drizzle: DrizzleDb,
  projectId: string,
  limit: number,
): Promise<AssessmentJobRow[]> {
  return drizzle
    .select()
    .from(assessmentJobs)
    .where(
      and(
        eq(assessmentJobs.projectId, projectId),
        inArray(assessmentJobs.status, ["queued", "running"]),
      ),
    )
    .limit(limit);
}

/**
 * Moves a `queued`/`running` job of this project to `cancelled`. Undefined
 * when nothing was cancellable (unknown id, wrong project, already terminal).
 */
export async function cancelActiveAssessmentJob(
  drizzle: DrizzleDb,
  input: { projectId: string; jobId: string },
  now: string,
): Promise<AssessmentJobRow | undefined> {
  const [cancelled] = await drizzle
    .update(assessmentJobs)
    .set({
      status: "cancelled",
      completedAt: now,
      leaseExpiresAt: null,
      error: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(assessmentJobs.id, input.jobId),
        eq(assessmentJobs.projectId, input.projectId),
        inArray(assessmentJobs.status, ["queued", "running"]),
      ),
    )
    .returning();
  return cancelled;
}

/**
 * Stamps the running job's pipeline stage in one atomic jsonb merge (no
 * SELECT-then-UPDATE, so overlapping stamps converge on the last writer).
 * Gated on `running`: it can neither resurrect a terminal job nor fight a
 * cancel. False when the job is no longer running.
 */
export async function stampAssessmentJobStage(
  drizzle: DrizzleDb,
  jobId: string,
  stage: string,
  now: string,
): Promise<boolean> {
  const [updated] = await drizzle
    .update(assessmentJobs)
    .set({
      payload: sql`${assessmentJobs.payload} || jsonb_build_object('stage', ${stage}::text, 'stageStartedAt', ${now}::text)`,
      updatedAt: now,
    })
    .where(
      and(eq(assessmentJobs.id, jobId), eq(assessmentJobs.status, "running")),
    )
    .returning({ id: assessmentJobs.id });
  return updated !== undefined;
}

/** Current status of one job (apply-time cancel check), or undefined. */
export async function getAssessmentJobStatus(
  drizzle: DrizzleDb,
  jobId: string,
): Promise<string | undefined> {
  const [row] = await drizzle
    .select({ status: assessmentJobs.status })
    .from(assessmentJobs)
    .where(eq(assessmentJobs.id, jobId));
  return row?.status;
}

/** Queue depth: `queued` + `running` (running so expired leases get recovered). */
export async function countActiveAssessmentJobs(
  drizzle: DrizzleDb,
): Promise<number> {
  const [row] = await drizzle
    .select({ value: count() })
    .from(assessmentJobs)
    .where(inArray(assessmentJobs.status, ["queued", "running"]));
  return Number(row?.value ?? 0);
}

/** Age (ms) of the oldest `queued` job, or null when none are waiting. */
export async function oldestQueuedAssessmentJobAge(
  drizzle: DrizzleDb,
): Promise<number | null> {
  const [row] = await drizzle
    .select({
      ageMs: sql<
        string | null
      >`(EXTRACT(EPOCH FROM (now() - min(${assessmentJobs.createdAt}))) * 1000)::bigint`,
    })
    .from(assessmentJobs)
    .where(eq(assessmentJobs.status, "queued"));
  if (row?.ageMs === null || row?.ageMs === undefined) return null;
  const parsed = Number(row.ageMs);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
