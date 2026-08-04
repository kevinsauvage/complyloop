import { generateObject } from "ai";
import { z } from "zod";
import type {
  Confidence,
  Control,
  Finding,
  RemediationSuggestion,
} from "@/core/types";
import { aiExplanationAvailable } from "./explainer";

const AI_MODEL = "openai/gpt-4o-mini";

const remediationSchema = z.object({
  description: z.string(),
  proposedSnippet: z.string(),
  /** Suggested attribute value when the fix inserts/edits an attribute. */
  attributeValue: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]),
});

export interface AiRemediationResult {
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
): Promise<AiRemediationResult | null> {
  if (!aiExplanationAvailable()) return null;
  try {
    const { object } = await generateObject({
      model: AI_MODEL,
      schema: remediationSchema,
      prompt: [
        "You propose accessibility remediations for React/TypeScript source.",
        `Requirement: ${control.code} / ${control.secondaryCode} — ${control.title}.`,
        `Finding: ${finding.reason}`,
        `File: ${finding.location.filePath}:${finding.location.line}`,
        `Current line: ${finding.location.snippet}`,
        finding.fix
          ? `A deterministic fix template exists (${finding.fix.kind}). Improve the developer-facing description and the proposed fixed line. If an attribute value is needed, put the best value in attributeValue.`
          : "No automated fix template exists. Propose a concrete one-line (or short) code change as proposedSnippet and describe it.",
        "Be concise. Output only the structured fields.",
      ].join("\n"),
    });

    const confidence: Confidence = object.confidence;
    return {
      suggestion: {
        description: object.description,
        proposedSnippet: object.proposedSnippet,
        provenance: "ai",
        confidence,
        model: AI_MODEL,
        generatedAt: new Date().toISOString(),
      },
      attributeValue: object.attributeValue?.trim() || undefined,
    };
  } catch {
    return null;
  }
}
