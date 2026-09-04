import { describe, expect, it } from "vitest";
import {
  confidenceDescription,
  determinationDescription,
  engineDescription,
  provenanceDescription,
  remediationStatusDescription,
  requirementStatusDescription,
  severityDescription,
} from "./badge-descriptions";

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