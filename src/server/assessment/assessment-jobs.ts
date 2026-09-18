import "server-only";

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

import {
  ASSESSMENT_JOB_STATUSES,
  ASSESSMENT_JOB_TRIGGERS,
  type AssessmentJobStatus,
  type AssessmentJobTrigger,
} from "@complyloop/analysis-core/contract/assessment-jobs";
import { type DrizzleDb, getDrizzle } from "@complyloop/db/postgres";
import { assessmentJobs } from "@complyloop/db/schema";

import {
  type AssessmentJob,
  type AssessmentJobPayload,
  assessmentJobPayloadSchema,
  type AssessmentJobStage,
} from "@/core/assessment-jobs";

import { reportWarning } from "../observability";

export type { AssessmentJob };

/**
 * Thrown when an apply-time re-check finds the job is no longer `running`
 * (the user cancelled mid-run). The surrounding transaction rolls back, so
 * the worker must report cancellation — never failure.
 */
export class AssessmentJobCancelledError extends Error {
  readonly jobId: string;
  constructor(jobId: string) {
    super(`Assessment job ${jobId} is no longer running.`);
    this.name = "AssessmentJobCancelledError";
    this.jobId = jobId;
  }
}

type AssessmentJobRow = typeof assessmentJobs.$inferSelect;

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_MS = 30 * 60_000;
const RETRY_BASE_MS = 30_000;

/**
 * How often a running worker extends its lease. Well below the 30-minute
 * lease so a live scan (clone + Playwright) can never expire mid-run and get
 * double-executed by `recoverExpiredLeases`.
 */
export const ASSESSMENT_JOB_HEARTBEAT_MS = 5 * 60_000;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function parseJobStatus(value: string): AssessmentJobStatus {
  if (!(ASSESSMENT_JOB_STATUSES as ReadonlyArray<string>).includes(value)) {
    throw new Error(`Unexpected assessment job status: ${value}`);
  }
  return value as AssessmentJobStatus;
}

function parseJobTrigger(value: string): AssessmentJobTrigger {
  if (!(ASSESSMENT_JOB_TRIGGERS as ReadonlyArray<string>).includes(value)) {
    throw new Error(`Unexpected assessment job trigger: ${value}`);
  }
  return value as AssessmentJobTrigger;
}

function parseJobPayload(value: unknown): AssessmentJobPayload {
  const parsed = assessmentJobPayloadSchema.safeParse(
    isPlainObject(value) ? value : {},
  );
  return parsed.success ? parsed.data : {};
}

/**
 * Fail-closed payload gate: scan authority is derived from the payload, so a
 * corrupt row must never degrade to `{}` (which scans as authoritative).
 * NULL/undefined (legacy rows) and schema-valid objects pass; anything else
 * (arrays, scalars, wrong-typed fields) is malformed and the claim
 * terminal-fails the job instead of handing it to a worker.
 */
export function isJobPayloadWellFormed(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (!isPlainObject(value)) return false;
  return assessmentJobPayloadSchema.safeParse(value).success;
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

/** Row values shared by the queued insert and the immediate-start insert. */
function newAssessmentJobRow(
  id: string,
  input: EnqueueAssessmentJobInput,
  now: string,
): typeof assessmentJobs.$inferInsert {
  return {
    id,
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
  };
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
  // Webhook coalescing: rapid pushes / PR synchronizes for the same project
  // would otherwise stack full scans of superseded SHAs behind the
  // serial-per-project claim. A still-queued webhook job is refreshed in place
  // (newest ref wins); running jobs and non-webhook triggers are untouched.
  if (input.trigger === "webhook") {
    const [pending] = await drizzle
      .select()
      .from(assessmentJobs)
      .where(
        and(
          eq(assessmentJobs.projectId, input.projectId),
          eq(assessmentJobs.status, "queued"),
          eq(assessmentJobs.trigger, "webhook"),
        ),
      )
      .orderBy(asc(assessmentJobs.createdAt))
      .limit(1);
    if (pending) {
      const pendingPayload = parseJobPayload(pending.payload);
      const pendingIsPrPreview =
        pendingPayload.pullRequestHeadSha !== undefined;
      const incomingIsPrPreview =
        input.payload?.pullRequestHeadSha !== undefined;
      // Authority boundary: pushes (authoritative, no pullRequestHeadSha) and
      // PR previews (pullRequestHeadSha set) must never coalesce into each
      // other, otherwise an authoritative scan is silently dropped or a
      // preview-only scan overwrites a pending authoritative one.
      if (pendingIsPrPreview === incomingIsPrPreview) {
        const oldRef = pendingPayload.ref;
        const newRef = input.payload?.ref;
        const seen = new Set<string>([
          ...(pendingPayload.supersededRefs ?? []),
          ...(input.payload?.supersededRefs ?? []),
        ]);
        if (oldRef && newRef && oldRef !== newRef) seen.add(oldRef);
        const mergedPayload: AssessmentJobPayload = {
          ...pendingPayload,
          ...(input.payload ?? {}),
        };
        if (seen.size > 0) mergedPayload.supersededRefs = [...seen];
        const [updated] = await drizzle
          .update(assessmentJobs)
          .set({
            payload: mergedPayload,
            availableAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(assessmentJobs.id, pending.id),
              eq(assessmentJobs.status, "queued"),
            ),
          )
          .returning();
        // Empty when a worker claimed the row concurrently — fall through and
        // insert so the delivery is not silently dropped.
        if (updated) return jobFromRow(updated);
      }
    }
  }
  if (input.trigger === "manual") {
    // Double-submit coalescing: two concurrent clicks can both pass the
    // active-job check in the dashboard action (separate connections) and
    // reach this insert. A second row would stack a redundant full scan
    // behind the first via the serial-per-project claim — return the pending
    // manual job instead. Running jobs are untouched (the action refuses
    // those with an "already running" message); terminal rows never match.
    const [pendingManual] = await drizzle
      .select()
      .from(assessmentJobs)
      .where(
        and(
          eq(assessmentJobs.projectId, input.projectId),
          eq(assessmentJobs.status, "queued"),
          eq(assessmentJobs.trigger, "manual"),
        ),
      )
      .orderBy(asc(assessmentJobs.createdAt))
      .limit(1);
    if (pendingManual) {
      const [updated] = await drizzle
        .update(assessmentJobs)
        .set({ availableAt: now, updatedAt: now })
        .where(
          and(
            eq(assessmentJobs.id, pendingManual.id),
            eq(assessmentJobs.status, "queued"),
          ),
        )
        .returning();
      // Empty when a worker claimed the row concurrently — fall through and
      // insert so the request is not silently dropped.
      if (updated) return jobFromRow(updated);
    }
  }
  try {
    const [created] = await drizzle
      .insert(assessmentJobs)
      .values(newAssessmentJobRow(crypto.randomUUID(), input, now))
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
  // Leases expire when a worker crashes mid-run. Requeue only while attempts
  // remain; a poison job (OOM, crash loop) at max attempts is terminal instead
  // of being resurrected on every claim tick forever.
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

/** Claims one ready job while ensuring only one assessment runs per project. */
export async function claimNextAssessmentJob(): Promise<AssessmentJob | null> {
  const drizzle = await getDrizzle();
  return drizzle.transaction(async (tx) => {
    const now = new Date().toISOString();
    await recoverExpiredLeases(tx, now);

    // Single-row claim: lock exactly the job we will run. The correlated
    // NOT EXISTS keeps one assessment per project without rescanning the table
    // (served by assessment_jobs_ready_idx + assessment_jobs_project_idx).
    // `attempts` and `project_id` are read in the same lock to avoid a second
    // round trip. The final UPDATE re-checks NOT EXISTS, and the partial
    // unique index assessment_jobs_running_project_uidx is the real backstop:
    // under READ COMMITTED two workers claiming different queued jobs for the
    // same project can both see "no running", so the loser gets 23505 and
    // this function returns null. Zero rows → lost the race → null.
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
    const candidateProjectId = String(
      (row as { project_id?: unknown; projectId?: unknown }).project_id ??
        (row as { projectId?: unknown }).projectId,
    );

    const leaseExpiresAt = new Date(
      Date.now() + DEFAULT_LEASE_MS,
    ).toISOString();
    let claimed;
    try {
      [claimed] = await tx
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
    } catch (error) {
      // Lost the race: a concurrent claim for the same project committed
      // first and the partial unique index
      // (assessment_jobs_running_project_uidx) rejected this UPDATE. Zero
      // rows would mean the same thing — no scan, just null.
      if (isUniqueViolation(error)) return null;
      throw error;
    }
    if (!claimed) return null;
    if (!isJobPayloadWellFormed(claimed.payload)) {
      // Fail closed: never hand a corrupt row to a worker (lenient parsing
      // would degrade it to `{}` and scan as authoritative). Terminal, not a
      // retry — re-running would fail identically.
      await tx
        .update(assessmentJobs)
        .set({
          status: "failed",
          completedAt: now,
          leaseExpiresAt: null,
          updatedAt: now,
          error: "Malformed job payload; refusing to scan.",
        })
        .where(eq(assessmentJobs.id, claimed.id));
      return null;
    }
    return jobFromRow(claimed);
  });
}

function reportStaleLease(jobId: string): void {
  reportWarning("Stale lease write rejected for assessment job", {
    code: "assessment_job_stale_lease",
    jobId,
  });
}

export async function completeAssessmentJob(job: AssessmentJob): Promise<void> {  const drizzle = await getDrizzle();
  const now = new Date().toISOString();
  const result = await drizzle
    .update(assessmentJobs)
    .set({
      status: "succeeded",
      completedAt: now,
      leaseExpiresAt: null,
      error: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(assessmentJobs.id, job.id),
        eq(assessmentJobs.status, "running"),
        eq(assessmentJobs.leaseExpiresAt, job.leaseExpiresAt as string),
        eq(assessmentJobs.startedAt, job.startedAt as string),
      ),
    )
    .returning({ id: assessmentJobs.id });
  if (result.length === 0) {
    reportStaleLease(job.id);
  }
}

export async function failAssessmentJob(
  job: AssessmentJob,
  error: unknown,
): Promise<AssessmentJobStatus> {
  const drizzle = await getDrizzle();
  const now = new Date();
  const message =
    error instanceof Error ? error.message : "Assessment job failed.";
  const terminal = job.attempts >= job.maxAttempts;
  const status: AssessmentJobStatus = terminal ? "failed" : "queued";
  const delay = RETRY_BASE_MS * 2 ** Math.max(0, job.attempts - 1);
  const result = await drizzle
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
    .where(
      and(
        eq(assessmentJobs.id, job.id),
        eq(assessmentJobs.status, "running"),
        eq(assessmentJobs.leaseExpiresAt, job.leaseExpiresAt as string),
        eq(assessmentJobs.startedAt, job.startedAt as string),
      ),
    )
    .returning({ id: assessmentJobs.id });
  if (result.length === 0) {
    reportStaleLease(job.id);
  }
  return status;
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

/**
 * Oldest still-active (`queued`/`running`) job for a project, or null.
 * The dashboard action uses this to refuse a second manual run while one is
 * already in flight, and the Run button uses it to disable itself — the
 * serial-per-project claim would otherwise stack full scans behind each
 * other with no visible explanation.
 */
export async function activeAssessmentJobForProject(
  projectId: string,
): Promise<AssessmentJob | null> {
  const drizzle = await getDrizzle();
  const rows = await drizzle
    .select()
    .from(assessmentJobs)
    .where(
      and(
        eq(assessmentJobs.projectId, projectId),
        inArray(assessmentJobs.status, ["queued", "running"]),
      ),
    )
    .limit(25);
  // Oldest-first in JS (not ORDER BY): one row is all the caller needs and
  // this stays deterministic regardless of index order.
  let oldest: (typeof rows)[number] | null = null;
  for (const row of rows) {
    if (!oldest || row.createdAt < oldest.createdAt) oldest = row;
  }
  return oldest ? jobFromRow(oldest) : null;
}

export interface CancelAssessmentJobInput {
  projectId: string;
  jobId: string;
}

/**
 * Moves a `queued`/`running` job to `cancelled` (project-scoped — a job from
 * another project is never touched). Returns the cancelled job, or null when
 * nothing was cancellable (unknown id, wrong project, already terminal).
 * A concurrently-running worker's `complete`/`fail` writes no-op via their
 * lease guards once the status leaves `running`; the heartbeat reports the
 * cancellation so the worker stops without recording failure evidence.
 */
export async function cancelAssessmentJob(
  input: CancelAssessmentJobInput,
): Promise<AssessmentJob | null> {
  const drizzle = await getDrizzle();
  const now = new Date().toISOString();
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
  return cancelled ? jobFromRow(cancelled) : null;
}

export interface RefreshAssessmentJobLeaseInput {
  id: string;
  leaseExpiresAt: string;
  startedAt: string;
}

/**
 * Worker heartbeat: extends a `running` job's lease by one full lease period.
 * Returns the new expiry, or null when the job left `running` (cancelled,
 * completed, or reaped) — the worker must then stop and neither
 * complete nor fail it.
 */
export async function refreshAssessmentJobLease(
  input: RefreshAssessmentJobLeaseInput,
): Promise<string | null> {
  const drizzle = await getDrizzle();
  const now = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + DEFAULT_LEASE_MS).toISOString();
  const [refreshed] = await drizzle
    .update(assessmentJobs)
    .set({ leaseExpiresAt, updatedAt: now })
    .where(
      and(
        eq(assessmentJobs.id, input.id),
        eq(assessmentJobs.status, "running"),
        eq(assessmentJobs.leaseExpiresAt, input.leaseExpiresAt),
        eq(assessmentJobs.startedAt, input.startedAt),
      ),
    )
    .returning({ leaseExpiresAt: assessmentJobs.leaseExpiresAt });
  return refreshed?.leaseExpiresAt ?? null;
}

/**
 * Best-effort worker progress update: stamps the job payload's current
 * pipeline stage (+ when it started). Fire-and-forget from the worker — never
 * throws, never touches non-`running` jobs (so a stale write can neither
 * resurrect a terminal job nor fight a cancel), and never blocks the run. A
 * missed update only costs UI freshness: the status column stays the source
 * of truth, and the last stage doubles as the crash marker (a killed worker
 * leaves its final stage behind instead of silence).
 */
export async function updateAssessmentJobStage(
  jobId: string,
  stage: AssessmentJobStage,
): Promise<boolean> {
  try {
    const drizzle = await getDrizzle();
    const [row] = await drizzle
      .select({ payload: assessmentJobs.payload })
      .from(assessmentJobs)
      .where(eq(assessmentJobs.id, jobId))
      .limit(1);
    if (!row) return false;
    const [updated] = await drizzle
      .update(assessmentJobs)
      .set({
        payload: {
          ...parseJobPayload(row.payload),
          stage,
          stageStartedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(eq(assessmentJobs.id, jobId), eq(assessmentJobs.status, "running")),
      )
      .returning({ id: assessmentJobs.id });
    return updated !== undefined;
  } catch (error) {
    reportWarning("Assessment job stage update failed", {
      code: "assessment_job_stage_update_failed",
      jobId,
      stage,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function queuedAssessmentJobCount(): Promise<number> {  const drizzle = await getDrizzle();
  const [row] = await drizzle
    .select({ value: count() })
    .from(assessmentJobs)
    .where(inArray(assessmentJobs.status, ["queued", "running"]));
  return Number(row?.value ?? 0);
}
