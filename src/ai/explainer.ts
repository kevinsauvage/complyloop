import { z } from "zod";

import type { Finding } from "@complyloop/analysis-core/contract/entities";
import type { Explanation } from "@complyloop/analysis-core/contract/finding-types";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import type { Confidence } from "@complyloop/analysis-core/contract/statuses";

import {
  AI_TEXT_MAX_CHARS,
  aiCall,
  type AiCallOnError,
  confidenceSchema,
  findingPromptContext,
} from "./ai-call";
import type { AiConfig } from "./ai-config";

const explanationSchema = z.object({
  whyItFailed: z.string().max(AI_TEXT_MAX_CHARS),
  impact: z.string().max(AI_TEXT_MAX_CHARS),
  howToFix: z.string().max(AI_TEXT_MAX_CHARS),
  confidence: confidenceSchema,
});

export function deterministicExplanation(
  reason: string,
  guidance: { impact: string; howToFix: string },
): Explanation {
  return {
    whyItFailed: reason,
    impact: guidance.impact,
    howToFix: guidance.howToFix,
    provenance: "deterministic",
    confidence: "high",
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generates a developer-oriented explanation with an LLM. Returns null when the
 * resolved config is null (AI unavailable) or the call fails — the
 * deterministic explanation remains the baseline either way, per the product
 * principle that AI is never the source of truth.
 */
export async function generateAiExplanation(
  finding: Finding,
  control: Control,
  config: AiConfig | null,
  options: { onError?: AiCallOnError } = {},
): Promise<Explanation | null> {
  const output = await aiCall({
    schema: explanationSchema,
    config,
    code: "ai_explanation_failed",
    detail: { findingId: finding.id, controlId: control.id },
    onError: options.onError,
    prompt: [
      "You explain accessibility compliance findings to web developers.",
      ...findingPromptContext(finding, control),
      "Write whyItFailed, impact (who is affected and how), and howToFix (concrete code-level guidance for this exact snippet).",
      "Set confidence to high/medium/low for how sure you are about this explanation.",
      "Be concise and practical; no legal language.",
    ],
  });
  if (!output || !config) return null;
  const confidence: Confidence = output.confidence;
  return {
    whyItFailed: output.whyItFailed,
    impact: output.impact,
    howToFix: output.howToFix,
    confidence,
    provenance: "ai",
    model: config.modelId,
    generatedAt: new Date().toISOString(),
  };
}
