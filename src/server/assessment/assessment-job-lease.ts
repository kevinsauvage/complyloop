import "server-only";

import { type AssessmentJobStatus } from "@complyloop/analysis-core/contract/assessment-jobs";
import { getDrizzle } from "@complyloop/db/postgres";
import {
  type AssessmentJobLease,
  claimNextAssessmentJobRow,
  failAssessmentJobTerminally,
  recoverExpiredAssessmentJobLeases,
  releaseRunningAssessmentJobs,
  renewAssessmentJobLease,
  settleAssessmentJob,
  stampAssessmentJobStage,
} from "@complyloop/db/repo/assessment-jobs";

import {
  type AssessmentJob,
  type AssessmentJobStage,
} from "@/core/assessment/assessment-jobs";

import { reportWarning } from "../observability";
import { isJobPayloadWellFormed, jobFromRow } from "./assessment-jobs";

const DEFAULT_LEASE_MS = 30 * 60_000;

const RETRY_BASE_MS = 30_000;

/**
 * How often a running worker extends its lease. Well below the 30-minute
 * lease so a live scan (clone + Playwright) can never expire mid-run and get
 * double-executed by `recoverExpiredLeases`.
 */
export const ASSESSMENT_JOB_HEARTBEAT_MS = 5 * 60_000;

/** Lease guard for complete/fail/heartbeat writes (claim-time pair). */
function leaseOf(job: {
  id: string;
  leaseExpiresAt?: string;
  startedAt?: string;
}): AssessmentJobLease | null {
  return job.leaseExpiresAt && job.startedAt
    ? {
        id: job.id,
        leaseExpiresAt: job.leaseExpiresAt,
        startedAt: job.startedAt,
      }
    : null;
}

/** Claims one ready job while ensuring only one assessment runs per project. */
export async function claimNextAssessmentJob(): Promise<AssessmentJob | null> {
  const drizzle = await getDrizzle();
  return drizzle.transaction(async (tx) => {
    const now = new Date().toISOString();
    await recoverExpiredAssessmentJobLeases(tx, now);
    const leaseExpiresAt = new Date(
      Date.now() + DEFAULT_LEASE_MS,
    ).toISOString();
    const claimed = await claimNextAssessmentJobRow(tx, now, leaseExpiresAt);
    if (!claimed) return null;
    if (!isJobPayloadWellFormed(claimed.payload)) {
      // Fail closed: never hand a corrupt row to a worker (lenient parsing
      // would degrade it to `{}` and scan as authoritative). Terminal, not a
      // retry — re-running would fail identically.
      await failAssessmentJobTerminally(
        tx,
        claimed.id,
        "Malformed job payload; refusing to scan.",
        now,
      );
      return null;
    }
    inFlightJobIds.add(claimed.id);
    return jobFromRow(claimed);
  });
}

/**
 * Jobs this process claimed and has not yet completed or failed. A fatal
 * crash (unhandled rejection, OOM handler) hands them back through
 * `releaseInFlightAssessmentJobs` instead of leaving them `running` until the
 * lease expires.
 */
const inFlightJobIds = new Set<string>();

/**
 * Returns this process's unfinished jobs to the queue (or fails them when
 * attempts are exhausted — a job that crashes the worker every time must not
 * loop forever). Best-effort: call it from a crash handler, never throws on an
 * empty set.
 */
export async function releaseInFlightAssessmentJobs(
  reason: string,
): Promise<number> {
  const ids = [...inFlightJobIds];
  if (ids.length === 0) return 0;
  const released = await releaseRunningAssessmentJobs(
    await getDrizzle(),
    ids,
    reason.slice(0, 2_000),
    new Date().toISOString(),
  );
  inFlightJobIds.clear();
  return released;
}

function reportStaleLease(jobId: string): void {
  reportWarning("Stale lease write rejected for assessment job", {
    code: "assessment_job_stale_lease",
    jobId,
  });
}

async function settleWithLease(
  job: AssessmentJob,
  set: Parameters<typeof settleAssessmentJob>[2],
  now: string,
): Promise<void> {
  const lease = leaseOf(job);
  const settled = lease
    ? await settleAssessmentJob(await getDrizzle(), lease, set, now)
    : false;
  inFlightJobIds.delete(job.id);
  if (!settled) reportStaleLease(job.id);
}

export async function completeAssessmentJob(job: AssessmentJob): Promise<void> {
  const now = new Date().toISOString();
  await settleWithLease(
    job,
    { status: "succeeded", completedAt: now, error: null },
    now,
  );
}

export async function failAssessmentJob(
  job: AssessmentJob,
  error: unknown,
): Promise<AssessmentJobStatus> {
  const now = new Date();
  const message =
    error instanceof Error ? error.message : "Assessment job failed.";
  const terminal = job.attempts >= job.maxAttempts;
  const status: AssessmentJobStatus = terminal ? "failed" : "queued";
  const delay = RETRY_BASE_MS * 2 ** Math.max(0, job.attempts - 1);
  await settleWithLease(
    job,
    {
      status,
      availableAt: terminal
        ? now.toISOString()
        : new Date(now.getTime() + delay).toISOString(),
      completedAt: terminal ? now.toISOString() : null,
      error: message.slice(0, 2_000),
    },
    now.toISOString(),
  );
  return status;
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
  return renewAssessmentJobLease(
    await getDrizzle(),
    input,
    new Date(Date.now() + DEFAULT_LEASE_MS).toISOString(),
    new Date().toISOString(),
  );
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
    return await stampAssessmentJobStage(
      await getDrizzle(),
      jobId,
      stage,
      new Date().toISOString(),
    );
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
