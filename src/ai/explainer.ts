import { generateObject } from "ai";
import { z } from "zod";
import type { Control, Explanation, Finding } from "@/core/types";

const AI_MODEL = "openai/gpt-4o-mini";

const explanationSchema = z.object({
  whyItFailed: z.string(),
  impact: z.string(),
  howToFix: z.string(),
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
    generatedAt: new Date().toISOString(),
  };
}

export function aiExplanationAvailable(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY);
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
  if (!aiExplanationAvailable()) return null;
  try {
    const { object } = await generateObject({
      model: AI_MODEL,
      schema: explanationSchema,
      prompt: [
        "You explain accessibility compliance findings to web developers.",
        `Requirement: ${control.code} / ${control.secondaryCode} — ${control.title}. ${control.description}`,
        `Automated check result: ${finding.reason}`,
        `Location: ${finding.location.filePath}:${finding.location.line}`,
        `Code: ${finding.location.snippet}`,
        "Write whyItFailed, impact (who is affected and how), and howToFix (concrete code-level guidance for this exact snippet).",
        "Be concise and practical; no legal language.",
      ].join("\n"),
    });
    return {
      ...object,
      provenance: "ai",
      model: AI_MODEL,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
