import "server-only";

import {
  ASSESSMENT_JOB_STATUSES,
  ASSESSMENT_JOB_TRIGGERS,
  type AssessmentJobStatus,
  type AssessmentJobTrigger,
} from "@complyloop/analysis-core/contract/assessment-jobs";
import { isOneOf } from "@complyloop/analysis-core/contract/literal-sets";
import { type DrizzleDb, getDrizzle } from "@complyloop/db/postgres";
import {
  type AssessmentJobRow,
  cancelActiveAssessmentJob,
  countActiveAssessmentJobs,
  findAssessmentJobByIdempotencyKey,
  findNewestAssessmentJob,
  findOldestQueuedAssessmentJob,
  insertAssessmentJob,
  listActiveAssessmentJobs,
  listRecentAssessmentJobs,
  oldestQueuedAssessmentJobAge,
  recoverExpiredAssessmentJobLeases,
  refreshQueuedAssessmentJob,
} from "@complyloop/db/repo/assessment-jobs";

import {
  type AssessmentJob,
  type AssessmentJobPayload,
  assessmentJobPayloadSchema,
} from "@/core/assessment/assessment-jobs";

import { redactSecrets } from "../redact";

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

const DEFAULT_MAX_ATTEMPTS = 3;

function parseJobStatus(value: string): AssessmentJobStatus {
  if (!isOneOf(ASSESSMENT_JOB_STATUSES, value)) {
    throw new Error(`Unexpected assessment job status: ${value}`);
  }
  return value;
}

function parseJobTrigger(value: string): AssessmentJobTrigger {
  if (!isOneOf(ASSESSMENT_JOB_TRIGGERS, value)) {
    throw new Error(`Unexpected assessment job trigger: ${value}`);
  }
  return value;
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

export function jobFromRow(row: AssessmentJobRow): AssessmentJob {
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
  db?: DrizzleDb,
): Promise<AssessmentJob> {
  const drizzle = db ?? (await getDrizzle());
  if (input.idempotencyKey) {
    const existing = await findAssessmentJobByIdempotencyKey(
      drizzle,
      input.idempotencyKey,
    );
    if (existing) return jobFromRow(existing);
  }

  const now = new Date().toISOString();
  // Webhook coalescing: rapid pushes for the same project would otherwise
  // stack full scans of superseded SHAs behind the serial-per-project claim.
  // A still-queued webhook job is refreshed in place (newest ref wins);
  // running jobs and non-webhook triggers are untouched.
  if (input.trigger === "webhook") {
    const pending = await findOldestQueuedAssessmentJob(
      drizzle,
      input.projectId,
      "webhook",
    );
    if (pending) {
      const pendingPayload = parseJobPayload(pending.payload);
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
      // A deployment target belongs to the commit it serves: a newer ref must
      // not keep auditing the older deploy (it would only be untied anyway).
      if (
        mergedPayload.runtimeTarget &&
        mergedPayload.runtimeTarget.sha !== mergedPayload.ref
      ) {
        delete mergedPayload.runtimeTarget;
      }
      const updated = await refreshQueuedAssessmentJob(drizzle, pending.id, {
        payload: mergedPayload,
        availableAt: now,
        updatedAt: now,
      });
      // Empty when a worker claimed the row concurrently — fall through and
      // insert so the delivery is not silently dropped.
      if (updated) return jobFromRow(updated);
    }
  }
  if (input.trigger === "manual") {
    // Double-submit coalescing: two concurrent clicks can both pass the
    // active-job check in the dashboard action (separate connections) and
    // reach this insert. A second row would stack a redundant full scan
    // behind the first via the serial-per-project claim — return the pending
    // manual job instead. Running jobs are untouched (the action refuses
    // those with an "already running" message); terminal rows never match.
    const pendingManual = await findOldestQueuedAssessmentJob(
      drizzle,
      input.projectId,
      "manual",
    );
    if (pendingManual) {
      const updated = await refreshQueuedAssessmentJob(
        drizzle,
        pendingManual.id,
        { availableAt: now, updatedAt: now },
      );
      // Empty when a worker claimed the row concurrently — fall through and
      // insert so the request is not silently dropped.
      if (updated) return jobFromRow(updated);
    }
  }
  return jobFromRow(
    await insertAssessmentJob(drizzle, {
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
    }),
  );
}

/**
 * Reclaims crashed-worker leases outside a claim tick. The manual Run action
 * and the Run form call this before reading the active job so an
 * expired-`running` row (dead executor, no heartbeat) does not block
 * re-dispatch until the 15-minute schedule happens to claim. Live leases are
 * untouched — only rows whose `leaseExpiresAt` already passed move.
 */
export async function recoverExpiredAssessmentLeases(
  db?: DrizzleDb,
): Promise<void> {
  // An already-open transaction must not nest: run the recovery inline on it.
  if (db) {
    await recoverExpiredAssessmentJobLeases(db, new Date().toISOString());
    return;
  }
  const drizzle = await getDrizzle();
  await drizzle.transaction(async (tx) => {
    await recoverExpiredAssessmentJobLeases(tx, new Date().toISOString());
  });
}

export async function recentAssessmentJobsForProject(
  projectId: string,
  limit = 5,
): Promise<AssessmentJob[]> {
  const rows = await listRecentAssessmentJobs(
    await getDrizzle(),
    projectId,
    limit,
  );
  return rows.map(jobFromRow);
}

/**
 * Whitelisted poll DTO: the dashboard island renders status, trigger, attempt
 * count, timestamps, the current stage and the error. Everything else on the
 * job row — notably `payload.runtimeTarget.url` (preview tokens), refs,
 * idempotency keys and the requesting user — must not leave the server.
 */
export function publicAssessmentJobView(job: AssessmentJob): AssessmentJob {
  return {
    id: job.id,
    projectId: job.projectId,
    status: job.status,
    trigger: job.trigger,
    payload: job.payload.stage ? { stage: job.payload.stage } : {},
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    availableAt: job.availableAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    ...(job.completedAt ? { completedAt: job.completedAt } : {}),
    ...(job.error ? { error: redactSecrets(job.error).slice(0, 500) } : {}),
  };
}

/**
 * Ref (commit SHA) of the project's newest webhook job in any state, or null.
 * `deployment_status` uses it to drop deployments of commits that a newer push
 * already replaced — auditing them would re-derive state from stale code.
 */
export async function latestWebhookJobRef(
  projectId: string,
): Promise<string | null> {
  const row = await findNewestAssessmentJob(
    await getDrizzle(),
    projectId,
    "webhook",
  );
  return row ? (parseJobPayload(row.payload).ref ?? null) : null;
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
  db?: DrizzleDb,
): Promise<AssessmentJob | null> {
  const rows = await listActiveAssessmentJobs(
    db ?? (await getDrizzle()),
    projectId,
    25,
  );
  // Oldest-first in JS (not ORDER BY): one row is all the caller needs and
  // this stays deterministic regardless of index order.
  let oldest: AssessmentJobRow | null = null;
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
  db?: DrizzleDb,
): Promise<AssessmentJob | null> {
  const cancelled = await cancelActiveAssessmentJob(
    db ?? (await getDrizzle()),
    input,
    new Date().toISOString(),
  );
  return cancelled ? jobFromRow(cancelled) : null;
}

export async function queuedAssessmentJobCount(): Promise<number> {
  return countActiveAssessmentJobs(await getDrizzle());
}

/**
 * Age (ms) of the oldest job still waiting in `queued`, or `null` when none
 * are waiting. `running` jobs are excluded on purpose: a long scan legitimately
 * ages, and the lease/heartbeat already covers a wedged worker. `ops:check`
 * uses this to alert on a stalled drain even when the depth is 1 — the
 * dispatch-token / disabled-schedule failure mode leaves a single job waiting
 * forever with no depth signal.
 */
export async function oldestQueuedAssessmentJobAgeMs(): Promise<number | null> {
  return oldestQueuedAssessmentJobAge(await getDrizzle());
}
