import { generateObject, generateText, NoObjectGeneratedError } from "ai";
import { z } from "zod";

import type { Finding } from "@complyloop/analysis-core/contract/entities";
import { engineFor } from "@complyloop/analysis-core/contract/finding-types";
import {
  formatLocationRef,
  locationSnippet,
} from "@complyloop/analysis-core/contract/location";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";

/** Error report handed to the `onError` hook on gateway failure. */
export interface AiErrorReport {
  /** Stable machine-readable code attached to the observability report. */
  code: string;
  /** Stringified failure, plus caller `detail` merged in. */
  detail: string;
  [key: string]: unknown;
}

/**
 * Failure hook owned by the server caller (`src/server` reports via
 * observability). `src/ai` never imports `@/server/*` — reporting is
 * injected, not reached for.
 */
export type AiCallOnError = (error: unknown, report: AiErrorReport) => void;

/** Vercel AI Gateway model id (`provider/model`). */
export const AI_MODEL = "poolside/laguna-s-2.1-free";

/** True when AI gateway credentials are configured. */
export function aiAvailable(): boolean {
  // Reads process.env directly (not via `@/server/env`): `src/ai` must stay
  // importable without `@/server/*` (client-bundle/edge boundary, ESLint).
  return Boolean(process.env.AI_GATEWAY_API_KEY);
}

/** User-facing copy when patch generation needs AI and none is configured. */
export const AI_PATCH_UNAVAILABLE_MESSAGE =
  "AI patch generation isn't enabled for this workspace, and there's no built-in fix for this finding. Use the developer handoff to fix it manually.";

/**
 * Shared zod schema for AI confidence values, aligned with analysis-core's
 * `Confidence` type (`"high" | "medium" | "low"`). Kept here so every AI
 * module that asks the gateway for a confidence parses it identically.
 */
export const confidenceSchema = z.enum(["high", "medium", "low"]);

/** Shared finding/control context lines for AI prompts (location + engine). */
export function findingPromptContext(
  finding: Finding,
  control: Control,
  runtimeNote = "This finding came from a rendered-page audit — guide the developer to the call site that renders this control, not a shared UI primitive.",
): string[] {
  return [
    `Requirement: ${control.code} / ${control.secondaryCode} — ${control.title}.`,
    `Finding: ${finding.reason}`,
    `Location: ${formatLocationRef(finding.location)}`,
    `Code: ${locationSnippet(finding.location)}`,
    engineFor(finding) === "runtime" ? runtimeNote : "",
  ];
}

interface AiCallInput<TSchema extends z.ZodType> {
  schema: TSchema;
  /** Set when AI credentials are configured; false short-circuits. */
  available: boolean;
  /** When true, unavailable/failed calls throw PublicError instead of returning null. */
  throwIfUnavailable?: boolean;
  prompt: string | string[];
  /** Stable machine-readable code attached to the error report. */
  code: string;
  /** Extra context merged into the error report. */
  detail?: Record<string, unknown>;
  /**
   * Failure hook for observability. When omitted the failure is silent
   * (null / `PublicError` per `throwIfUnavailable`) — server callers pass a
   * `reportError` wrapper to keep gateway failures visible.
   */
  onError?: AiCallOnError;
  /** User-facing copy when `throwIfUnavailable` is set. */
  failureMessage?: string;
}

/**
 * Shared AI gateway shell: availability check + structured `generateObject`,
 * with a `generateText` + parse fallback for models without structured-output
 * support (the gateway reports `responseFormat` unsupported for those —
 * `generateObject` then fails with `NoObjectGeneratedError` even though the
 * model can emit JSON as text). Returns `null` when AI is disabled or the
 * call fails unless `throwIfUnavailable` is set. Callers always keep a
 * deterministic baseline (AI never sets status), and failures surface through
 * `onError` so the server boundary owns observability.
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
  const prompt =
    Array.isArray(input.prompt) ? input.prompt.join("\n") : input.prompt;
  const fail = (failure: unknown): null => {
    input.onError?.(failure, {
      code: input.code,
      detail: failure instanceof Error ? failure.message : String(failure),
      ...input.detail,
    });
    if (input.throwIfUnavailable) {
      throw new PublicError(
        input.failureMessage ?? "AI call failed. Try again.",
      );
    }
    return null;
  };
  try {
    const { object } = await generateObject({
      model: AI_MODEL,
      schema: input.schema,
      prompt,
    });
    return object as z.infer<TSchema>;
  } catch (error) {
    if (!isNoObjectGeneratedError(error)) return fail(error);
    try {
      return await generateTextFallback(input, prompt);
    } catch (fallbackError) {
      return fail(fallbackError);
    }
  }
}

/** True for the SDK's structured-output parse failure (incl. name match). */
function isNoObjectGeneratedError(error: unknown): boolean {
  if (error instanceof NoObjectGeneratedError) return true;
  return error instanceof Error && error.name === "AI_NoObjectGeneratedError";
}

/** Required top-level keys for the JSON-only fallback prompt. */
function schemaKeys(schema: z.ZodType): string[] {
  if (schema instanceof z.ZodObject) return Object.keys(schema.shape);
  return [];
}

/** Parses model text output, tolerating fences and surrounding prose. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return JSON.parse(raw);
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * Single retry for models that cannot do structured output: ask for JSON-only
 * text, then parse + zod-validate exactly like the structured path. Throws
 * when the text is not valid JSON or fails the schema, so the caller reports
 * it through the same `onError` channel.
 */
async function generateTextFallback<TSchema extends z.ZodType>(
  input: AiCallInput<TSchema>,
  prompt: string,
): Promise<z.infer<TSchema>> {
  const keys = schemaKeys(input.schema);
  const { text } = await generateText({
    model: AI_MODEL,
    prompt: [
      prompt,
      "Respond with ONLY a JSON object (no prose, no code fences).",
      ...(keys.length > 0
        ? [`The object must have exactly these keys: ${keys.join(", ")}.`]
        : []),
    ].join("\n"),
  });
  const parsed = input.schema.safeParse(extractJson(text));
  if (!parsed.success) {
    throw new Error(
      `AI response did not match the expected shape: ${parsed.error.message}`,
    );
  }
  return parsed.data as z.infer<TSchema>;
}
