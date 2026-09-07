import { describe, expect, it } from "vitest";
import {
  confidenceDisplay,
  determinationDisplay,
  EVIDENCE_TONE_BADGE,
  EVIDENCE_TONE_DOT,
  evidenceDisplay,
  engineDisplay,
  findingStatusDisplay,
  provenanceDisplay,
  remediationStatusDisplay,
  requirementStatusDisplay,
  roleTone,
  severityDisplay,
} from "./status-display";
import { severityRank } from "./prioritization";
import { REQUIREMENT_STATUS_DISPLAY_ORDER } from "@complyloop/analysis-core/contract/statuses";
import type { EvidenceKind } from "@complyloop/db/types";
import {
  FINDING_STATUSES,
  REMEDIATION_STATUSES,
  REQUIREMENT_STATUSES,
  type RemediationStatus,
  type RequirementStatus,
  type Severity,
} from "@complyloop/analysis-core/contract/statuses";

const SEVERITIES: Severity[] = ["critical", "serious", "moderate", "minor"];

describe("requirementStatusDisplay", () => {
  it("labels every requirement status", () => {
    expect(
      REQUIREMENT_STATUSES.map((status) => [
        status,
        requirementStatusDisplay(status).label,
      ]),
    ).toEqual([
      ["passed", "Passed"],
      ["failed", "Failed"],
      ["needs_review", "Needs review"],
      ["not_applicable", "Not applicable"],
      ["unable_to_verify", "Unable to verify"],
    ]);
  });

  it("describes every requirement status", () => {
    for (const status of REQUIREMENT_STATUSES) {
      expect(requirementStatusDisplay(status).description.length).toBeGreaterThan(
        10,
      );
    }
  });

  it("maps every requirement status tone", () => {
    expect(
      REQUIREMENT_STATUS_DISPLAY_ORDER.map(
        (status) => requirementStatusDisplay(status).tone,
      ),
    ).toEqual(["failed", "review", "passed", "na", "unverifiable"]);
  });

  it("throws on an unhandled status", () => {
    expect(() =>
      requirementStatusDisplay("bogus" as RequirementStatus),
    ).toThrow(/Unhandled requirement status/);
  });
});

describe("remediationStatusDisplay", () => {
  it("labels every remediation status", () => {
    expect(
      REMEDIATION_STATUSES.map((status) => [
        status,
        remediationStatusDisplay(status).label,
      ]),
    ).toEqual([
      ["detected", "Detected"],
      ["suggested", "Suggested"],
      ["approved", "Approved"],
      ["implemented", "Implemented"],
      ["verified", "Verified"],
    ]);
  });

  it("describes every remediation status with a tone-token badge", () => {
    for (const status of REMEDIATION_STATUSES) {
      const display = remediationStatusDisplay(status);
      expect(display.description.length).toBeGreaterThan(10);
      if (display.tone) {
        expect(display.tone).toMatch(
          /^(passed|failed|review|na|unverifiable|signal)$/,
        );
      }
    }
  });

  it("throws on an unhandled status", () => {
    expect(() =>
      remediationStatusDisplay("bogus" as RemediationStatus),
    ).toThrow(/Unhandled remediation status/);
  });
});

describe("evidenceDisplay", () => {
  it("uses engineer-facing copy instead of snake_case ids", () => {
    expect(evidenceDisplay("assessment_completed").label).toBe(
      "Assessment completed",
    );
    expect(evidenceDisplay("requirements_imported").label).toBe("Scope updated");
    expect(evidenceDisplay("finding", { event: "detected" }).label).toBe(
      "Finding detected",
    );
  });

  it("provides a human label for every evidence kind", () => {
    const kinds: EvidenceKind[] = [
      "project_connected",
      "project_disconnected",
      "project_reset",
      "assessment_completed",
      "assessment_job",
      "finding",
      "remediation_approved",
      "remediation_implemented",
      "remediation_verified",
      "remediation_manually_verified",
      "ai_remediation_suggested",
      "ai_patch_ready",
      "requirement_status_changed",
      "requirement_exception_set",
      "requirement_exception_cleared",
      "requirement_human_passed",
      "requirement_human_pass_cleared",
      "requirements_imported",
      "pull_request_prepared",
      "monitoring_changes_detected",
      "webhook_reassessment",
    ];
    for (const kind of kinds) {
      expect(evidenceDisplay(kind).label.length).toBeGreaterThan(0);
      expect(evidenceDisplay(kind).label).not.toContain("_");
    }
  });

  it("maps finding events and assessment job phases to tones", () => {
    expect(evidenceDisplay("finding", { event: "detected" }).tone).toBe("fail");
    expect(evidenceDisplay("finding", { event: "resolved" }).tone).toBe("pass");
    expect(evidenceDisplay("finding", { event: "dismissed" }).tone).toBe(
      "review",
    );
    expect(evidenceDisplay("assessment_job", { phase: "completed" }).tone).toBe(
      "pass",
    );
    expect(evidenceDisplay("assessment_job", { phase: "failed" }).tone).toBe(
      "fail",
    );
    expect(evidenceDisplay("assessment_job", { phase: "queued" }).tone).toBe(
      "signal",
    );
  });

  it("covers every evidence tone with a dot and badge class", () => {
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
        evidenceDisplay(kind).tone,
        evidenceDisplay("finding", { event: "resolved" }).tone,
      ]),
    );
    for (const tone of tones) {
      expect(EVIDENCE_TONE_DOT[tone]).toBeDefined();
      expect(EVIDENCE_TONE_BADGE[tone]).toBeDefined();
    }
  });

  it("throws on an unhandled kind", () => {
    expect(() => evidenceDisplay("bogus" as EvidenceKind)).toThrow(
      /Unhandled evidence kind/,
    );
  });
});

describe("findingStatusDisplay", () => {
  it("labels every finding status", () => {
    expect(
      FINDING_STATUSES.map((status) => [
        status,
        findingStatusDisplay(status).label,
      ]),
    ).toEqual([
      ["open", "Open"],
      ["resolved", "Resolved"],
      ["dismissed", "Dismissed"],
    ]);
  });
});

describe("determinationDisplay", () => {
  it("labels and describes both determination methods", () => {
    expect(determinationDisplay("automated").label).toBe("Automated");
    expect(determinationDisplay("human_review").label).toBe("Human review");
    expect(determinationDisplay("automated").description).toContain(
      "deterministic",
    );
    expect(determinationDisplay("human_review").description).toContain(
      "reviewer",
    );
    expect(determinationDisplay("automated").tone).toBe("signal");
    expect(determinationDisplay("human_review").tone).toBe("signal");
  });
});

describe("severityDisplay", () => {
  it("labels every severity", () => {
    expect(SEVERITIES.map((severity) => severityDisplay(severity).label)).toEqual([
      "Critical",
      "Serious",
      "Moderate",
      "Minor",
    ]);
  });

  it("describes every severity", () => {
    for (const severity of SEVERITIES) {
      expect(severityDisplay(severity).description.length).toBeGreaterThan(10);
    }
  });

  it("throws on an unhandled severity", () => {
    expect(() => severityDisplay("bogus" as Severity)).toThrow(
      /Unhandled severity/,
    );
  });
});

describe("severityRank", () => {
  it("ranks severities with critical first", () => {
    expect(SEVERITIES.map(severityRank)).toEqual([0, 1, 2, 3]);
  });

  it("throws on an unhandled severity", () => {
    expect(() => severityRank("bogus" as Severity)).toThrow(
      /Unhandled severity/,
    );
  });
});

describe("confidenceDisplay", () => {
  it("describes every confidence level", () => {
    for (const confidence of ["high", "medium", "low"] as const) {
      expect(confidenceDisplay(confidence).description.length).toBeGreaterThan(
        10,
      );
    }
  });

  it("throws on an unrecognized confidence", () => {
    expect(() => confidenceDisplay("certain" as never)).toThrow(
      /Unhandled confidence/,
    );
  });
});

describe("provenanceDisplay", () => {
  it("describes both provenance values with labels", () => {
    expect(provenanceDisplay("deterministic").label).toBe("Deterministic");
    expect(provenanceDisplay("ai").label).toBe("AI-generated");
    expect(provenanceDisplay("deterministic").description).toContain(
      "Rule-based",
    );
    expect(provenanceDisplay("ai").description).toContain("never sets");
  });
});

describe("engineDisplay", () => {
  it("describes both assessment engines with labels", () => {
    expect(engineDisplay("ast").label).toBe("Source (AST)");
    expect(engineDisplay("runtime").label).toBe("Runtime (DOM)");
    expect(engineDisplay("ast").description).toContain("source code");
    expect(engineDisplay("runtime").description).toContain("rendered page");
  });
});

describe("roleTone", () => {
  it("maps every org role", () => {
    expect(roleTone("owner")).toBe("signal");
    expect(roleTone("admin")).toBe("review");
    expect(roleTone("member")).toBe("passed");
    expect(roleTone("viewer")).toBe("na");
  });
});
