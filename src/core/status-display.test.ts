import { describe, expect, it } from "vitest";
import {
  confidenceDescription,
  determinationDescription,
  determinationLabel,
  EVIDENCE_TONE_BADGE,
  EVIDENCE_TONE_DOT,
  evidenceKindLabel,
  evidenceTone,
  engineDescription,
  findingStatusLabel,
  provenanceDescription,
  remediationStatusDescription,
  remediationStatusLabel,
  requirementStatusDescription,
  requirementStatusLabel,
  roleTone,
  severityDescription,
  severityLabel,
  severityRank,
  statusTone,
} from "./status-display";
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

describe("requirementStatusLabel", () => {
  it("labels every requirement status", () => {
    expect(
      REQUIREMENT_STATUSES.map((status) => [
        status,
        requirementStatusLabel(status),
      ]),
    ).toEqual([
      ["passed", "Passed"],
      ["failed", "Failed"],
      ["needs_review", "Needs review"],
      ["not_applicable", "Not applicable"],
      ["unable_to_verify", "Unable to verify"],
    ]);
  });

  it("throws on an unhandled status", () => {
    expect(() =>
      requirementStatusLabel("bogus" as RequirementStatus),
    ).toThrow(/Unhandled requirement status/);
  });
});

describe("remediationStatusLabel", () => {
  it("labels every remediation status", () => {
    expect(
      REMEDIATION_STATUSES.map((status) => [
        status,
        remediationStatusLabel(status),
      ]),
    ).toEqual([
      ["detected", "Detected"],
      ["suggested", "Suggested"],
      ["approved", "Approved"],
      ["implemented", "Implemented"],
      ["verified", "Verified"],
    ]);
  });

  it("throws on an unhandled status", () => {
    expect(() =>
      remediationStatusLabel("bogus" as RemediationStatus),
    ).toThrow(/Unhandled remediation status/);
  });
});

describe("evidenceKindLabel", () => {
  it("uses engineer-facing copy instead of snake_case ids", () => {
    expect(evidenceKindLabel("assessment_completed")).toBe(
      "Assessment completed",
    );
    expect(evidenceKindLabel("requirements_imported")).toBe("Scope updated");
    expect(
      evidenceKindLabel("finding", { event: "detected" }),
    ).toBe("Finding detected");
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
      expect(evidenceKindLabel(kind).length).toBeGreaterThan(0);
      expect(evidenceKindLabel(kind)).not.toContain("_");
    }
  });

  it("throws on an unhandled kind", () => {
    expect(() =>
      evidenceKindLabel("bogus" as EvidenceKind),
    ).toThrow(/Unhandled evidence kind/);
  });
});

describe("findingStatusLabel", () => {
  it("labels every finding status", () => {
    expect(
      FINDING_STATUSES.map((status) => [status, findingStatusLabel(status)]),
    ).toEqual([
      ["open", "Open"],
      ["resolved", "Resolved"],
      ["dismissed", "Dismissed"],
    ]);
  });
});

describe("determinationLabel", () => {
  it("labels both determination methods", () => {
    expect(determinationLabel("automated")).toBe("Automated");
    expect(determinationLabel("human_review")).toBe("Human review");
  });
});

describe("severity helpers", () => {
  it("ranks severities with critical first", () => {
    expect(SEVERITIES.map(severityRank)).toEqual([0, 1, 2, 3]);
  });

  it("labels every severity", () => {
    expect(SEVERITIES.map(severityLabel)).toEqual([
      "Critical",
      "Serious",
      "Moderate",
      "Minor",
    ]);
  });

  it("throws on an unhandled severity", () => {
    expect(() => severityRank("bogus" as Severity)).toThrow(
      /Unhandled severity/,
    );
    expect(() => severityLabel("bogus" as Severity)).toThrow(
      /Unhandled severity/,
    );
  });
});

describe("requirementStatusDescription", () => {
  it("describes every requirement status without throwing", () => {
    for (const status of [
      "passed",
      "failed",
      "needs_review",
      "not_applicable",
      "unable_to_verify",
    ] as const) {
      expect(requirementStatusDescription(status).length).toBeGreaterThan(10);
    }
  });

  it("throws on an unrecognized status", () => {
    expect(() => requirementStatusDescription("nope" as never)).toThrow(
      /Unhandled requirement status/,
    );
  });
});

describe("remediationStatusDescription", () => {
  it("describes every remediation status", () => {
    for (const status of [
      "detected",
      "suggested",
      "approved",
      "implemented",
      "verified",
    ] as const) {
      expect(remediationStatusDescription(status).length).toBeGreaterThan(10);
    }
  });
});

describe("severityDescription", () => {
  it("describes every severity", () => {
    for (const severity of ["critical", "serious", "moderate", "minor"] as const) {
      expect(severityDescription(severity).length).toBeGreaterThan(10);
    }
  });
});

describe("confidenceDescription", () => {
  it("describes every confidence level", () => {
    for (const confidence of ["high", "medium", "low"] as const) {
      expect(confidenceDescription(confidence).length).toBeGreaterThan(10);
    }
  });

  it("throws on an unrecognized confidence", () => {
    expect(() => confidenceDescription("certain" as never)).toThrow(
      /Unhandled confidence/,
    );
  });
});

describe("determinationDescription", () => {
  it("describes both determination methods", () => {
    expect(determinationDescription("automated")).toContain("deterministic");
    expect(determinationDescription("human_review")).toContain("reviewer");
  });
});

describe("provenanceDescription", () => {
  it("describes both provenance values", () => {
    expect(provenanceDescription("deterministic")).toContain("Rule-based");
    expect(provenanceDescription("ai")).toContain("never sets");
  });
});

describe("engineDescription", () => {
  it("describes both assessment engines", () => {
    expect(engineDescription("ast")).toContain("source code");
    expect(engineDescription("runtime")).toContain("rendered page");
  });
});

describe("statusTone", () => {
  it("maps every requirement status", () => {
    expect(REQUIREMENT_STATUS_DISPLAY_ORDER.map(statusTone)).toEqual([
      "failed",
      "review",
      "passed",
      "na",
      "unverifiable",
    ]);
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