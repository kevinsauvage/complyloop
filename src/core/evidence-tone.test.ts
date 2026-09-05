import type { EvidenceKind } from "@complyloop/analysis-core/contract/finding-types";
import { describe, expect, it } from "vitest";
import { EVIDENCE_TONE_BADGE, EVIDENCE_TONE_DOT, evidenceTone } from "./evidence-tone";

describe("evidenceTone", () => {
  it("maps finding events to tones", () => {
    expect(evidenceTone("finding", { event: "detected" })).toBe("fail");
    expect(evidenceTone("finding", { event: "resolved" })).toBe("pass");
    expect(evidenceTone("finding", { event: "dismissed" })).toBe("review");
  });

  it("maps assessment job phases to tones", () => {
    expect(evidenceTone("assessment_job", { phase: "completed" })).toBe("pass");
    expect(evidenceTone("assessment_job", { phase: "failed" })).toBe("fail");
    expect(evidenceTone("assessment_job", { phase: "queued" })).toBe("signal");
  });

  it("covers every evidence kind with a dot and badge class", () => {
    const kinds: EvidenceKind[] = [
      "project_connected",
      "assessment_completed",
      "assessment_job",
      "finding",
      "remediation_verified",
      "webhook_reassessment",
    ];
    const tones = new Set(
      kinds.flatMap((kind) => [
        evidenceTone(kind),
        evidenceTone("finding", { event: "resolved" }),
      ]),
    );
    for (const tone of tones) {
      expect(EVIDENCE_TONE_DOT[tone]).toBeDefined();
      expect(EVIDENCE_TONE_BADGE[tone]).toBeDefined();
    }
  });

  it("throws on an unhandled kind", () => {
    expect(() => evidenceTone("bogus" as EvidenceKind)).toThrow(
      /Unhandled evidence kind/,
    );
  });
});
