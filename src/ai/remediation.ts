import { z } from "zod";

import type { Finding } from "@complyloop/analysis-core/contract/entities";
import type { RemediationSuggestion } from "@complyloop/analysis-core/contract/finding-types";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import type { Confidence } from "@complyloop/analysis-core/contract/statuses";

import {
  aiAvailable,
  aiCall,
  type AiCallOnError,
  confidenceSchema,
  findingPromptContext,
  resolveAiModel,
} from "./ai-call";

/**
 * Bounded at the AI output boundary: `attributeValue` flows into
 * `finding.fix.value` and later a source edit, so cap the length and reject
 * characters that cannot land in an HTML/JSX attribute value (`<`, `>`,
 * control chars). Quotes stay allowed for values like `l'image`.
 */
const attributeValueSchema = z
  .string()
  .max(256, { error: "Attribute value is too long." })
  .refine((value) => !/[<>\u0000-\u001f]/.test(value), {
    error: "Attribute value contains characters that are unsafe in source.",
  });

export const remediationSchema = z.object({
  description: z.string(),
  proposedSnippet: z.string(),
  /** Suggested attribute value when the fix inserts/edits an attribute. */
  attributeValue: attributeValueSchema.optional(),
  confidence: confidenceSchema,
});

interface AiRemediationResult {
  suggestion: RemediationSuggestion;
  /** When present, replace an editable insert_attribute fix value. */
  attributeValue?: string;
}

/**
 * Asks the model for a remediation proposal. Returns null without credentials
 * or on failure. Never applies changes — callers put the result at `suggested`.
 */
export async function generateAiRemediation(
  finding: Finding,
  control: Control,
  options: { onError?: AiCallOnError } = {},
): Promise<AiRemediationResult | null> {
  const object = await aiCall({
    schema: remediationSchema,
    available: aiAvailable(),
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
  if (!object) return null;
  const confidence: Confidence = object.confidence;
  return {
    suggestion: {
      description: object.description,
      proposedSnippet: object.proposedSnippet,
      provenance: "ai",
      confidence,
      model: resolveAiModel(),
      generatedAt: new Date().toISOString(),
    },
    attributeValue: object.attributeValue?.trim() || undefined,
  };
}
