/**
 * Assessment job queue states and triggers — the single source of truth.
 * Consumed by the DB CHECK constraints (`packages/db/src/schema.ts`), the
 * worker/queue row mapping (`src/server/assessment/assessment-jobs.ts`), the
 * zod schemas (`src/core/assessment-jobs.ts`), and the zod-free client guard
 * (`src/core/assessment-job-guard.ts`), so a status change lands in exactly
 * one place.
 */
export const ASSESSMENT_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type AssessmentJobStatus = (typeof ASSESSMENT_JOB_STATUSES)[number];

export const ASSESSMENT_JOB_TRIGGERS = ["manual", "webhook"] as const;

export type AssessmentJobTrigger = (typeof ASSESSMENT_JOB_TRIGGERS)[number];
