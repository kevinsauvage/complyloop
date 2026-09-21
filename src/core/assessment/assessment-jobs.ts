import { z } from "zod";

import {
  ASSESSMENT_JOB_STATUSES,
  ASSESSMENT_JOB_TRIGGERS,
} from "@complyloop/analysis-core/contract/assessment-jobs";

/**
 * Worker progress vocabulary: the pipeline stage a running job is in. Written
 * best-effort onto the job payload (see `updateAssessmentJobStage`) and
 * rendered by the Pipeline section — the status column stays the source of
 * truth, this is only the "what is it doing" hint.
 */
export const ASSESSMENT_JOB_STAGES = [
  "checkout",
  "changedetection",
  "ast",
  "runtime",
  "reconcile",
  "apply",
] as const;

export const assessmentJobStageSchema = z.enum(ASSESSMENT_JOB_STAGES);

export type AssessmentJobStage = z.infer<typeof assessmentJobStageSchema>;

/** API / client shape for one assessment job — single source for type + zod. */
export const assessmentJobPayloadSchema = z.object({
  ref: z.string().optional(),
  // `pull_request` is legacy: PR preview scans were removed (merge-push scans
  // are the only webhook topology). Kept in the enum so old queued rows still
  // parse — the worker treats any non-push webhook job as non-authoritative.
  eventName: z.enum(["push", "pull_request"]).optional(),
  supersededRefs: z.array(z.string()).optional(),
  // `verify_remediation` jobs only: the finding whose implemented remediation
  // should be re-audited. Carried on the payload (not a new column) so the
  // queue stays one table and the worker can resolve the finding itself.
  findingId: z.string().optional(),
  stage: assessmentJobStageSchema.optional(),
  stageStartedAt: z.string().optional(),
});

export const assessmentJobSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  status: z.enum(ASSESSMENT_JOB_STATUSES),
  trigger: z.enum(ASSESSMENT_JOB_TRIGGERS),
  requestedByUserId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  payload: assessmentJobPayloadSchema,
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  availableAt: z.string(),
  startedAt: z.string().optional(),
  leaseExpiresAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AssessmentJobPayload = z.infer<typeof assessmentJobPayloadSchema>;
export type AssessmentJob = z.infer<typeof assessmentJobSchema>;

export const assessmentJobsResponseSchema = z.object({
  jobs: z.array(assessmentJobSchema),
});
