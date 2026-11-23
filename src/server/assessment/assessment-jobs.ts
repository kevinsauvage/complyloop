import "server-only";

import { createHash } from "node:crypto";

import {
  ASSESSMENT_JOB_TRIGGERS,
  type AssessmentJobTrigger,
} from "@complyloop/analysis-core/contract/assessment-jobs";
import { isOneOf } from "@complyloop/analysis-core/contract/literal-sets";
import { ASSESSMENT_QUEUE, createJobQueue } from "@complyloop/db/job-queue";
import { type DrizzleDb, getDrizzle } from "@complyloop/db/postgres";
import {
  type AssessmentJobData,
  type AssessmentJobRow,
  countActiveAssessmentJobs,
  findAssessmentJobById,
  findNewestAssessmentJob,
  findOldestActiveAssessmentJob,
  findOldestQueuedAssessmentJob,
  listRecentAssessmentJobs,
  oldestQueuedAssessmentJobAge,
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
    status: row.status,
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

/**
 * pg-boss ids are uuids: a delivery's idempotency key maps to a fixed one, so
 * a redelivered webhook or retried request finds the job it already created.
 */
function jobIdForKey(key: string): string {
  const hex = createHash("sha256").update(`assessment:${key}`).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

async function readJob(drizzle: DrizzleDb, id: string): Promise<AssessmentJob> {
  const row = await findAssessmentJobById(drizzle, id);
  if (!row) throw new Error(`Assessment job ${id} vanished after enqueue.`);
  return jobFromRow(row);
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
  const queue = createJobQueue(drizzle);
  const keyedId = input.idempotencyKey
    ? jobIdForKey(input.idempotencyKey)
    : undefined;
  if (keyedId) {
    const existing = await findAssessmentJobById(drizzle, keyedId);
    if (existing) return jobFromRow(existing);
  }

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
      const data: AssessmentJobData = {
        projectId: pending.projectId,
        trigger: pending.trigger,
        requestedByUserId: pending.requestedByUserId,
        idempotencyKey: pending.idempotencyKey,
        payload: mergedPayload,
      };
      // Zero when a worker claimed the job meanwhile: fall through and send a
      // new one so the delivery is not silently dropped.
      const { updated } = await queue.update(ASSESSMENT_QUEUE, data, {
        id: pending.id,
      });
      if (updated > 0) return readJob(drizzle, pending.id);
    }
  }
  if (input.trigger === "manual") {
    // Double-submit coalescing: two concurrent clicks can both pass the
    // active-job check in the dashboard action; return the pending manual job
    // instead of stacking a redundant full scan behind it.
    const pendingManual = await findOldestQueuedAssessmentJob(
      drizzle,
      input.projectId,
      "manual",
    );
    if (pendingManual) return jobFromRow(pendingManual);
  }

  const data: AssessmentJobData = {
    projectId: input.projectId,
    trigger: input.trigger,
    requestedByUserId: input.requestedByUserId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    payload: { ...(input.payload ?? {}) },
  };
  // One assessment per project at a time: the worker fetches with
  // `groupConcurrency: 1` on the project group.
  const id = await queue.send(ASSESSMENT_QUEUE, data, {
    ...(keyedId ? { id: keyedId } : {}),
    group: { id: input.projectId },
  });
  // Null only when a concurrent request sent the same keyed id first.
  return readJob(drizzle, id ?? keyedId ?? "");
}

/**
 * Housekeeping pg-boss would run on a timer: retries jobs whose worker died
 * (missed heartbeat) and deletes old jobs. Rate-limited by pg-boss, so calling
 * it on every drain or Run click is cheap.
 */
export async function superviseAssessmentQueue(): Promise<void> {
  await createJobQueue(await getDrizzle()).supervise(ASSESSMENT_QUEUE);
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
  const row = await findOldestActiveAssessmentJob(
    db ?? (await getDrizzle()),
    projectId,
  );
  return row ? jobFromRow(row) : null;
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
  const drizzle = db ?? (await getDrizzle());
  const row = await findAssessmentJobById(drizzle, input.jobId);
  if (
    !row ||
    row.projectId !== input.projectId ||
    (row.status !== "queued" && row.status !== "running")
  ) {
    return null;
  }
  const { affected } = await createJobQueue(drizzle).cancel(
    ASSESSMENT_QUEUE,
    row.id,
  );
  return affected > 0 ? readJob(drizzle, row.id) : null;
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
