import { generateObject } from "ai";
import { z } from "zod";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { reportError } from "@/server/observability";

/** Vercel AI Gateway model id (`provider/model`). */
export const AI_MODEL = "poolside/laguna-s-2.1-free";

/** User-facing copy when patch generation needs AI and none is configured. */
export const AI_PATCH_UNAVAILABLE_MESSAGE =
  "AI patch generation isn't enabled for this workspace, and there's no built-in fix for this finding. Use the developer handoff to fix it manually.";

/**
 * Shared zod schema for AI confidence values, aligned with analysis-core's
 * `Confidence` type (`"high" | "medium" | "low"`). Kept here so every AI
 * module that asks the gateway for a confidence parses it identically.
 */
export const confidenceSchema = z.enum(["high", "medium", "low"]);

interface AiCallInput<TSchema extends z.ZodType> {
  schema: TSchema;
  /** Set when AI credentials are configured; false short-circuits. */
  available: boolean;
  /** When true, unavailable/failed calls throw PublicError instead of returning null. */
  throwIfUnavailable?: boolean;
  prompt: string | string[];
  /** Stable machine-readable code attached to the observability report. */
  code: string;
  /** Extra context attached to the observability report. */
  detail?: Record<string, unknown>;
  /** User-facing copy when `throwIfUnavailable` is set. */
  failureMessage?: string;
}

/**
 * Shared AI gateway shell: availability check + structured `generateObject`.
 * Returns `null` when AI is disabled or the call fails unless
 * `throwIfUnavailable` is set. Callers always keep a deterministic baseline
 * (AI never sets status), and failures are reported for observability.
 */
export async function aiCall<TSchema extends z.ZodType>(
  input: AiCallInput<TSchema>,
): Promise<z.infer<TSchema> | null> {
  if (!input.available) {
    if (input.throwIfUnavailable) {
      throw new PublicError(
        input.failureMessage ??
          "AI is unavailable. Check AI credentials or try again.",
      );
    }
    return null;
  }
  try {
    const { object } = await generateObject({
      model: AI_MODEL,
      schema: input.schema,
      prompt: Array.isArray(input.prompt)
        ? input.prompt.join("\n")
        : input.prompt,
    });
    return object as z.infer<TSchema>;
  } catch (error) {
    reportError(error, {
      code: input.code,
      detail: error instanceof Error ? error.message : String(error),
      ...input.detail,
    });
    if (input.throwIfUnavailable) {
      throw new PublicError(
        input.failureMessage ?? "AI call failed. Try again.",
      );
    }
    return null;
  }
}
