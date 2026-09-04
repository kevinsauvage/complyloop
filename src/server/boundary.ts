import { z } from "zod";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { firstIssueMessage, formRecord } from "@/core/boundary";
import { formError, type ActionMessageState } from "./action-state";

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

export function parseFormState<T>(
  schema: z.ZodType<T>,
  formData: FormData,
  fallback = "Invalid form input.",
): { ok: true; data: T } | { ok: false; state: ActionMessageState } {
  const result = schema.safeParse(formRecord(formData));
  if (!result.success) {
    return {
      ok: false,
      state: formError(firstIssueMessage(result.error, fallback)),
    };
  }
  return { ok: true, data: result.data };
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
