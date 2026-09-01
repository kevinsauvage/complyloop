import { describe, expect, it } from "vitest";
import type { EvidenceKind } from "./finding-types";
import { EVIDENCE_TONE_BADGE, evidenceTone } from "./evidence-tone";

describe("evidenceTone", () => {
  it("maps finding lifecycle kinds to pass, fail, and review", () => {
    expect(evidenceTone("finding_detected")).toBe("fail");
    expect(evidenceTone("finding_resolved")).toBe("pass");
    expect(evidenceTone("finding_dismissed")).toBe("review");
  });

  it("assigns a badge tint for every tone", () => {
    const tones = new Set(
      (
        [
          "finding_detected",
          "finding_resolved",
          "project_connected",
          "remediation_approved",
          "requirement_status_changed",
        ] satisfies EvidenceKind[]
      ).map(evidenceTone),
    );
    for (const tone of tones) {
      expect(EVIDENCE_TONE_BADGE[tone]).toBeDefined();
    }
  });
});
