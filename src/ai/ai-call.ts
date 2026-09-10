import { generateObject } from "ai";
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
 * Shared AI gateway shell: availability check + structured `generateObject`.
 * Returns `null` when AI is disabled or the call fails unless
 * `throwIfUnavailable` is set. Callers always keep a deterministic baseline
 * (AI never sets status), and failures surface through `onError` so the
 * server boundary owns observability.
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
    input.onError?.(error, {
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
