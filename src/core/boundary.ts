import { z } from "zod";
import {
  ASSESSMENT_JOB_STATUSES,
  ASSESSMENT_JOB_TRIGGERS,
} from "@complyloop/analysis-core/contract/assessment-jobs";

export const entityIdSchema = z.string().trim().min(1).max(128);

export const optionalNoteSchema = z
  .string()
  .max(2000)
  .optional()
  .transform((value) => {
    if (value == null) return undefined;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  });

export function requiredField(message: string, max = 128) {
  return z
    .string({ error: message })
    .trim()
    .min(1, { error: message })
    .max(max, { error: message });
}

export function findingIdsField(emptyMessage: string) {
  return z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (value == null) return [];
      const ids = (Array.isArray(value) ? value : [value])
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      return [...new Set(ids)];
    })
    .pipe(z.array(entityIdSchema).min(1, { error: emptyMessage }));
}

const githubRepoSummarySchema = z.object({
  fullName: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  private: z.boolean(),
  defaultBranch: z.string().min(1),
  updatedAt: z.string(),
  htmlUrl: z.string().min(1),
  cloneUrl: z.string().min(1),
  installationId: z.number().int().positive().optional(),
});

export const githubRepoSearchResponseSchema = z.object({
  repos: z.array(githubRepoSummarySchema),
  page: z.number().int().min(1),
  hasMore: z.boolean(),
  error: z.string().optional(),
});

const assessmentJobSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  status: z.enum(ASSESSMENT_JOB_STATUSES),
  trigger: z.enum(ASSESSMENT_JOB_TRIGGERS),
  requestedByUserId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  payload: z.object({
    ref: z.string().optional(),
    eventName: z.enum(["push", "pull_request"]).optional(),
    pullRequestHeadSha: z.string().optional(),
  }),
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

export const assessmentJobsResponseSchema = z.object({
  jobs: z.array(assessmentJobSchema),
});

export function formRecord(
  formData: FormData,
): Record<string, string | string[]> {
  const record: Record<string, string | string[]> = {};
  for (const key of new Set(formData.keys())) {
    const values = formData
      .getAll(key)
      .filter((value): value is string => typeof value === "string");
    const [first, ...rest] = values;
    if (first != null && rest.length === 0) {
      record[key] = first;
    } else if (rest.length > 0) {
      record[key] = values;
    }
  }
  return record;
}

export function firstIssueMessage(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

export function parseUnknown<T>(
  schema: z.ZodType<T>,
  value: unknown,
  message: string,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(message);
  return result.data;
}
