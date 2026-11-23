import "server-only";

import type { JobAttempt } from "pg-boss";

import { type AssessmentJobStatus } from "@complyloop/analysis-core/contract/assessment-jobs";
import { ASSESSMENT_QUEUE, createJobQueue } from "@complyloop/db/job-queue";
import { getDrizzle } from "@complyloop/db/postgres";
import {
  exhaustAssessmentJobRetries,
  findAssessmentJobById,
  stampAssessmentJobStage,
} from "@complyloop/db/repo/assessment-jobs";

import {
  type AssessmentJob,
  type AssessmentJobStage,
} from "@/core/assessment/assessment-jobs";

import { reportWarning } from "../observability";
import { isJobPayloadWellFormed, jobFromRow } from "./assessment-jobs";

/**
 * How often a running worker touches its job. Well below the queue's
 * 15-minute `heartbeatSeconds`, after which pg-boss treats the worker as dead
 * and retries the job.
 */
export const ASSESSMENT_JOB_HEARTBEAT_MS = 5 * 60_000;

async function queue() {
  return createJobQueue(await getDrizzle());
}

/** Settles only the attempt this worker fetched, never a later retry of it. */
function attemptOf(job: { id: string; attempts: number }): JobAttempt {
  return { id: job.id, retryCount: Math.max(0, job.attempts - 1) };
}

/**
 * Claims one ready job; at most one runs per project (`groupConcurrency`).
 * A malformed job is failed for good and the next one is tried, so it cannot
 * end a drain that has other work.
 */
export async function claimNextAssessmentJob(): Promise<AssessmentJob | null> {
  const boss = await queue();
  const drizzle = await getDrizzle();
  for (;;) {
    const [fetched] = await boss.fetch(ASSESSMENT_QUEUE, {
      batchSize: 1,
      groupConcurrency: 1,
    });
    if (!fetched) return null;
    const row = await findAssessmentJobById(drizzle, fetched.id);
    if (!row) continue;
    if (isJobPayloadWellFormed(row.payload)) {
      inFlightJobs.set(row.id, attemptOf(row));
      return jobFromRow(row);
    }
    // Fail closed: never hand a corrupt job to a worker (lenient parsing
    // would degrade it to `{}` and scan as authoritative).
    await exhaustAssessmentJobRetries(drizzle, row.id);
    await boss.fail(ASSESSMENT_QUEUE, attemptOf(row), {
      message: "Malformed job payload; refusing to scan.",
    });
  }
}

/**
 * Jobs this process claimed and has not yet completed or failed. A fatal
 * crash (unhandled rejection, OOM handler) hands them back through
 * `releaseInFlightAssessmentJobs` instead of leaving them active until the
 * heartbeat lapses.
 */
const inFlightJobs = new Map<string, JobAttempt>();

/**
 * Fails this process's unfinished jobs, so pg-boss retries them while attempts
 * remain. Best-effort: call it from a crash handler.
 */
export async function releaseInFlightAssessmentJobs(
  reason: string,
): Promise<number> {
  const attempts = [...inFlightJobs.values()];
  if (attempts.length === 0) return 0;
  const { affected } = await (
    await queue()
  ).fail(ASSESSMENT_QUEUE, attempts, { message: reason.slice(0, 2_000) });
  inFlightJobs.clear();
  return affected;
}

function reportStaleLease(jobId: string): void {
  reportWarning("Stale lease write rejected for assessment job", {
    code: "assessment_job_stale_lease",
    jobId,
  });
}

export async function completeAssessmentJob(job: AssessmentJob): Promise<void> {
  const { affected } = await (
    await queue()
  ).complete(ASSESSMENT_QUEUE, attemptOf(job));
  inFlightJobs.delete(job.id);
  if (affected === 0) reportStaleLease(job.id);
}

/** Fails one attempt; pg-boss retries it with backoff while attempts remain. */
export async function failAssessmentJob(
  job: AssessmentJob,
  error: unknown,
): Promise<AssessmentJobStatus> {
  const message =
    error instanceof Error ? error.message : "Assessment job failed.";
  const { affected } = await (
    await queue()
  ).fail(ASSESSMENT_QUEUE, attemptOf(job), {
    message: message.slice(0, 2_000),
  });
  inFlightJobs.delete(job.id);
  if (affected === 0) reportStaleLease(job.id);
  return job.attempts >= job.maxAttempts ? "failed" : "queued";
}

export interface RefreshAssessmentJobLeaseInput {
  id: string;
  /** The attempt this worker runs: a re-claim by another worker fences it out. */
  attempts: number;
  leaseExpiresAt: string;
  startedAt: string;
}

/**
 * Worker heartbeat. Returns the job's deadline, or null when the job left
 * `running` (cancelled, completed, or expired): the worker must then stop and
 * neither complete nor fail it.
 */
export async function refreshAssessmentJobLease(
  input: RefreshAssessmentJobLeaseInput,
): Promise<string | null> {
  const { affected } = await (
    await queue()
  ).touch(ASSESSMENT_QUEUE, attemptOf(input));
  return affected > 0 ? input.leaseExpiresAt : null;
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
