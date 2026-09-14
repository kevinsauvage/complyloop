import { z } from "zod";

import {
  ASSESSMENT_JOB_STATUSES,
  ASSESSMENT_JOB_TRIGGERS,
} from "@complyloop/analysis-core/contract/assessment-jobs";

/** API / client shape for one assessment job — single source for type + zod. */
export const assessmentJobPayloadSchema = z.object({
  ref: z.string().optional(),
  eventName: z.enum(["push", "pull_request"]).optional(),
  pullRequestHeadSha: z.string().optional(),
  supersededRefs: z.array(z.string()).optional(),
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
