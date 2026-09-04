import { describe, expect, it } from "vitest";
import {
  evidenceKindHref,
  EVIDENCE_KIND_FILTER_ORDER,
  parseEvidenceKindParam,
} from "./evidence-kind-filter";

describe("EVIDENCE_KIND_FILTER_ORDER", () => {
  it("exposes filterable evidence kinds in display order", () => {
    expect(EVIDENCE_KIND_FILTER_ORDER).toContain("finding_detected");
    expect(EVIDENCE_KIND_FILTER_ORDER).toContain("assessment_job_failed");
    expect(EVIDENCE_KIND_FILTER_ORDER).toContain("remediation_verified");
  });
});

describe("parseEvidenceKindParam", () => {
  it("parses a plain string", () => {
    expect(parseEvidenceKindParam("finding_resolved")).toBe("finding_resolved");
  });

  it("parses the first element of an array (Next searchParams shape)", () => {
    expect(parseEvidenceKindParam(["ai_patch_ready", "unused"])).toBe(
      "ai_patch_ready",
    );
  });

  it("returns undefined for empty, unknown, and unvalidated values", () => {
    expect(parseEvidenceKindParam(undefined)).toBeUndefined();
    expect(parseEvidenceKindParam([])).toBeUndefined();
    expect(parseEvidenceKindParam("")).toBeUndefined();
    expect(parseEvidenceKindParam("bogus_kind")).toBeUndefined();
    expect(parseEvidenceKindParam(["unknown"])).toBeUndefined();
  });
});

describe("evidenceKindHref", () => {
  it("returns the base path with no params", () => {
    expect(evidenceKindHref()).toBe("/evidence");
  });

  it("adds the kind param when provided", () => {
    expect(evidenceKindHref("finding_detected")).toBe(
      "/evidence?kind=finding_detected",
    );
  });

  it("adds page only when it is greater than one", () => {
    expect(evidenceKindHref("finding_detected", 2)).toBe(
      "/evidence?kind=finding_detected&page=2",
    );
    expect(evidenceKindHref("finding_detected", 1)).toBe(
      "/evidence?kind=finding_detected",
    );
    expect(evidenceKindHref(undefined, 3)).toBe("/evidence?page=3");
  });
});