import { generateObject } from "ai";
import { z } from "zod";
import type { Confidence } from "@/core/statuses";
import type { Control } from "@/core/project-types";
import type { Explanation, Finding } from "@/core/finding-types";
import { formatLocationRef } from "@/core/location";
import { AI_MODEL } from "./model";
import { aiWarn } from "./warn";

const explanationSchema = z.object({
  whyItFailed: z.string(),
  impact: z.string(),
  howToFix: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
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
        `Location: ${formatLocationRef(finding.location)}`,
        `Code: ${finding.location.snippet}`,
        finding.engine === "runtime"
          ? "This finding came from a rendered-page audit — guide the developer to the call site that renders this control, not a shared UI primitive."
          : "",
        "Write whyItFailed, impact (who is affected and how), and howToFix (concrete code-level guidance for this exact snippet).",
        "Set confidence to high/medium/low for how sure you are about this explanation.",
        "Be concise and practical; no legal language.",
      ].join("\n"),
    });
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
  } catch (error) {
    aiWarn("AI explanation unavailable or failed", {
      code: "ai_explanation_failed",
      findingId: finding.id,
      controlId: control.id,
      detail: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
