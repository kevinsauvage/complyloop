/**
 * Assessment job queue states and triggers — the single source of truth.
 * Consumed by the DB CHECK constraints (`packages/db/src/schema.ts`), the
 * worker/queue implementation (`src/server/assessment-jobs.ts`), and the
 * client response schema (`src/core/boundary.ts`) so a status change lands
 * in exactly one place.
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