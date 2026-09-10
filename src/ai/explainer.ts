import { z } from "zod";
import type { Confidence } from "@complyloop/analysis-core/contract/statuses";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import type { Finding } from "@complyloop/analysis-core/contract/entities";
import type { Explanation } from "@complyloop/analysis-core/contract/finding-types";
import {
  AI_MODEL,
  aiAvailable,
  aiCall,
  confidenceSchema,
  findingPromptContext,
} from "./ai-call";

const explanationSchema = z.object({
  whyItFailed: z.string(),
  impact: z.string(),
  howToFix: z.string(),
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
 * Generates a developer-oriented explanation with an LLM. Returns null when no
 * AI credentials are configured or the call fails — the deterministic
 * explanation remains the baseline either way, per the product principle that
 * AI is never the source of truth.
 */
export async function generateAiExplanation(
  finding: Finding,
  control: Control,
): Promise<Explanation | null> {
  const object = await aiCall({
    schema: explanationSchema,
    available: aiAvailable(),
    code: "ai_explanation_failed",
    detail: { findingId: finding.id, controlId: control.id },
    prompt: [
      "You explain accessibility compliance findings to web developers.",
      ...findingPromptContext(finding, control),
      `Automated check result: ${finding.reason}`,
      "Write whyItFailed, impact (who is affected and how), and howToFix (concrete code-level guidance for this exact snippet).",
      "Set confidence to high/medium/low for how sure you are about this explanation.",
      "Be concise and practical; no legal language.",
    ],
  });
  if (!object) return null;
  const confidence: Confidence = object.confidence;
  return {
    whyItFailed: object.whyItFailed,
    impact: object.impact,
    howToFix: object.howToFix,
    confidence,
    provenance: "ai",
    model: AI_MODEL,
    generatedAt: new Date().toISOString(),
  };
}
