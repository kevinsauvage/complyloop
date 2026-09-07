import { z } from "zod";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { firstIssueMessage, formRecord } from "@/core/boundary";

export function parseForm<T>(
  schema: z.ZodType<T>,
  formData: FormData,
  fallback = "Invalid form input.",
): T {
  const result = schema.safeParse(formRecord(formData));
  if (!result.success) {
    throw new PublicError(firstIssueMessage(result.error, fallback), "validation");
  }
  return result.data;
}

export function parseInput<T>(
  schema: z.ZodType<T>,
  value: unknown,
  fallback = "Invalid input.",
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new PublicError(firstIssueMessage(result.error, fallback), "validation");
  }
  return result.data;
}
