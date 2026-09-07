import { describe, expect, it } from "vitest";
import {
  EVIDENCE_KIND_FILTER_ORDER,
  evidenceKindHref,
  parseEvidenceKindParam,
} from "./query";

describe("EVIDENCE_KIND_FILTER_ORDER", () => {
  it("lists consolidated kinds for the evidence page chips", () => {
    expect(EVIDENCE_KIND_FILTER_ORDER).toContain("finding");
    expect(EVIDENCE_KIND_FILTER_ORDER).toContain("assessment_job");
  });

  it("keeps the chip allow-list short (no noun-pair kinds)", () => {
    for (const kind of EVIDENCE_KIND_FILTER_ORDER) {
      expect(kind).not.toMatch(/_set$|_cleared$|human_pass/);
    }
  });
});

describe("parseEvidenceKindParam", () => {
  it("parses a valid kind", () => {
    expect(parseEvidenceKindParam("finding")).toBe("finding");
  });

  it("returns undefined for missing or invalid values", () => {
    expect(parseEvidenceKindParam(undefined)).toBeUndefined();
    expect(parseEvidenceKindParam([])).toBeUndefined();
    expect(parseEvidenceKindParam("")).toBeUndefined();
    expect(parseEvidenceKindParam("bogus_kind")).toBeUndefined();
    expect(parseEvidenceKindParam(["unknown"])).toBeUndefined();
  });
});

describe("evidenceKindHref", () => {
  it("builds filter links", () => {
    expect(evidenceKindHref("finding")).toBe("/evidence?kind=finding");
    expect(evidenceKindHref("finding", 2)).toBe(
      "/evidence?kind=finding&page=2",
    );
    expect(evidenceKindHref("finding", 1)).toBe("/evidence?kind=finding");
  });
});
