import { z } from "zod";

import type { Finding } from "@complyloop/analysis-core/contract/entities";
import type { RemediationSuggestion } from "@complyloop/analysis-core/contract/finding-types";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import type { Confidence } from "@complyloop/analysis-core/contract/statuses";

import {
  AI_SNIPPET_MAX_CHARS,
  AI_TEXT_MAX_CHARS,
  aiCall,
  type AiCallOnError,
  confidenceSchema,
  findingPromptContext,
} from "./ai-call";
import type { AiConfig } from "./ai-config";

/**
 * Bounded at the AI output boundary: `attributeValue` flows into
 * `finding.fix.value` and later a source edit, so cap the length and reject
 * characters that cannot land in an HTML/JSX attribute value (`<`, `>`,
 * `"`, backtick, braces, control chars) — they could break out of the
 * `attr="…"` insertion and inject code. Single quotes stay allowed for values
 * like `l'image`.
 */
const attributeValueSchema = z
  .string()
  .max(256, { error: "Attribute value is too long." })
  .refine((value) => !/[<>"`{}\u0000-\u001f]/.test(value), {
    error: "Attribute value contains characters that are unsafe in source.",
  });

export const remediationSchema = z.object({
  description: z.string().max(AI_TEXT_MAX_CHARS),
  proposedSnippet: z.string().max(AI_SNIPPET_MAX_CHARS),
  /** Suggested attribute value when the fix inserts/edits an attribute. */
  attributeValue: attributeValueSchema.optional(),
  confidence: confidenceSchema,
});

export interface AiRemediationResult {
  suggestion: RemediationSuggestion;
  /** When present, replace an editable insert_attribute fix value. */
  attributeValue?: string;
}

/**
 * Asks the model for a remediation proposal. Returns null without a resolved
 * config or on failure. Never applies changes — callers put the result at
 * `suggested`.
 */
export async function generateAiRemediation(
  finding: Finding,
  control: Control,
  config: AiConfig | null,
  options: { onError?: AiCallOnError } = {},
): Promise<AiRemediationResult | null> {
  const output = await aiCall({
    schema: remediationSchema,
    config,
    code: "ai_remediation_failed",
    detail: { findingId: finding.id, controlId: control.id },
    onError: options.onError,
    prompt: [
      "You propose accessibility remediations for React/TypeScript source.",
      ...findingPromptContext(
        finding,
        control,
        "Runtime finding — propose a call-site fix, not a generic aria-label on a shared Input/Button primitive.",
      ),
      finding.fix
        ? `A deterministic fix template exists (${finding.fix.kind}). Improve the developer-facing description and the proposed fixed line. If an attribute value is needed, put the best value in attributeValue.`
        : "No automated fix template exists. Propose a concrete one-line (or short) code change as proposedSnippet and describe it.",
      "Be concise. Output only the structured fields.",
    ],
  });
  if (!output || !config) return null;
  const confidence: Confidence = output.confidence;
  return {
    suggestion: {
      description: output.description,
      proposedSnippet: output.proposedSnippet,
      provenance: "ai",
      confidence,
      model: config.modelId,
      generatedAt: new Date().toISOString(),
    },
    attributeValue: output.attributeValue?.trim() || undefined,
  };
}
