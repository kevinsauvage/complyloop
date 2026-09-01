import { describe, expect, it } from "vitest";
import {
  evidenceKindLabel,
  remediationStatusLabel,
  requirementStatusLabel,
  severityLabel,
  severityRank,
} from "./labels";
import type { EvidenceKind } from "./finding-types";
import {
  REMEDIATION_STATUSES,
  REQUIREMENT_STATUSES,
  type RemediationStatus,
  type RequirementStatus,
  type Severity,
} from "./statuses";

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
    expect(evidenceKindLabel("finding_detected")).toBe("Finding detected");
  });

  it("throws on an unhandled kind", () => {
    expect(() =>
      evidenceKindLabel("bogus" as EvidenceKind),
    ).toThrow(/Unhandled evidence kind/);
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
