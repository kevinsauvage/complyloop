import { generateObject } from "ai";
import { z } from "zod";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { AI_MODEL } from "./model";

/** User-facing copy when patch generation needs AI and none is configured. */
export const AI_PATCH_UNAVAILABLE_MESSAGE =
  "Generating a patch requires AI (set AI_GATEWAY_API_KEY) or a deterministic fix template for this Finding. Use the developer handoff to fix it manually.";

type AiWarnFn = (
  message: string,
  context?: Record<string, unknown>,
) => void;

let warnFn: AiWarnFn = () => {
  /* default: no-op until the server wires observability */
};

export function setAiWarn(fn: AiWarnFn): void {
  warnFn = fn;
}

export function aiWarn(
  message: string,
  context?: Record<string, unknown>,
): void {
  warnFn(message, context);
}

interface AiCallInputBase<TSchema extends z.ZodType> {
  schema: TSchema;
  /** Set when AI credentials are configured; null short-circuits. */
  available: boolean;
  prompt: string | string[];
  warnMessage: string;
  warnCode: string;
  warnDetail?: Record<string, unknown>;
  /** User-facing copy when `onFailure` is `"throw"`. */
  failureMessage?: string;
}

type AiCallInputThrow<TSchema extends z.ZodType> = AiCallInputBase<TSchema> & {
  onFailure: "throw";
};

type AiCallInputNull<TSchema extends z.ZodType> = AiCallInputBase<TSchema> & {
  /** When `"throw"`, failures surface as PublicError instead of returning null. */
  onFailure?: "null";
};

/**
 * Shared AI gateway shell: availability check + structured `generateObject` +
 * warn on failure. Returns `null` when AI is disabled or the call fails unless
 * `onFailure` is `"throw"`. Callers always keep a deterministic baseline (AI
 * never sets status).
 */
export async function aiCall<TSchema extends z.ZodType>(
  input: AiCallInputThrow<TSchema>,
): Promise<z.infer<TSchema>>;
export async function aiCall<TSchema extends z.ZodType>(
  input: AiCallInputNull<TSchema>,
): Promise<z.infer<TSchema> | null>;
export async function aiCall<TSchema extends z.ZodType>(
  input: AiCallInputThrow<TSchema> | AiCallInputNull<TSchema>,
): Promise<z.infer<TSchema> | null> {
  const onFailure = input.onFailure ?? "null";
  if (!input.available) {
    if (onFailure === "throw") {
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
      prompt: Array.isArray(input.prompt) ? input.prompt.join("\n") : input.prompt,
    });
    return object as z.infer<TSchema>;
  } catch (error) {
    aiWarn(input.warnMessage, {
      code: input.warnCode,
      detail: error instanceof Error ? error.message : String(error),
      ...input.warnDetail,
    });
    if (onFailure === "throw") {
      throw new PublicError(
        input.failureMessage ?? input.warnMessage,
      );
    }
    return null;
  }
}
