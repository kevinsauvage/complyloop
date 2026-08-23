import { describe, expect, it } from "vitest";
import {
  remediationStatusLabel,
  requirementStatusLabel,
  severityLabel,
  severityRank,
} from "./labels";
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
      ["investigating", "Investigating"],
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
