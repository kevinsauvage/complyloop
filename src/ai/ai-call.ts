import { generateObject } from "ai";
import { z } from "zod";
import { AI_MODEL } from "./model";
import { aiWarn } from "./warn";

interface AiCallInput<TSchema extends z.ZodType> {
  schema: TSchema;
  /** Set when AI credentials are configured; null short-circuits. */
  available: boolean;
  prompt: string | string[];
  warnMessage: string;
  warnCode: string;
  warnDetail?: Record<string, unknown>;
}

/**
 * Shared AI gateway shell: availability check + structured `generateObject` +
 * warn-and-null on failure. Returns `null` when AI is disabled or the call
 * fails — callers always keep a deterministic baseline (AI never sets status).
 */
export async function aiCall<TSchema extends z.ZodType>(
  input: AiCallInput<TSchema>,
): Promise<z.infer<TSchema> | null> {
  if (!input.available) return null;
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
    return null;
  }
}