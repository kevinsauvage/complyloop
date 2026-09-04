import { describe, expect, it } from "vitest";
import type { EvidenceKind } from "@complyloop/analysis-core/contract/finding-types";
import { EVIDENCE_TONE_BADGE, EVIDENCE_TONE_DOT, evidenceTone } from "./evidence-tone";

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

  it("classifies every evidence kind into a valid tone", () => {
    const kinds: EvidenceKind[] = [
      "finding_detected",
      "assessment_job_failed",
      "monitoring_changes_detected",
      "finding_resolved",
      "remediation_verified",
      "remediation_manually_verified",
      "assessment_completed",
      "assessment_job_completed",
      "requirement_human_passed",
      "ai_patch_ready",
      "finding_dismissed",
      "requirement_exception_set",
      "requirement_status_changed",
      "remediation_approved",
      "remediation_implemented",
      "ai_remediation_suggested",
      "pull_request_prepared",
      "assessment_job_queued",
      "webhook_reassessment",
      "project_connected",
      "project_disconnected",
      "project_reset",
      "requirement_exception_cleared",
      "requirement_human_pass_cleared",
      "requirements_imported",
    ];
    const tones = new Set(["default", "pass", "fail", "review", "signal"]);
    for (const kind of kinds) {
      expect(tones.has(evidenceTone(kind))).toBe(true);
      expect(EVIDENCE_TONE_DOT[evidenceTone(kind)]).toBeDefined();
    }
  });

  it("throws on an unhandled kind", () => {
    expect(() => evidenceTone("bogus" as EvidenceKind)).toThrow(
      /Unhandled evidence kind/,
    );
  });
});
