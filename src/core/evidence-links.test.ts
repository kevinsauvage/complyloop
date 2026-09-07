import { describe, expect, it } from "vitest";
import type { EvidenceRecord } from "@complyloop/db/types";
import { evidenceRecordHref } from "./query";

const base: EvidenceRecord = {
  id: "e1",
  at: "2026-01-02T00:00:00.000Z",
  kind: "assessment_completed",
  summary: "Assessment finished",
};

describe("evidenceRecordHref", () => {
  it("links a finding event to its finding page", () => {
    expect(
      evidenceRecordHref({ ...base, findingId: "f42" }, []),
    ).toBe("/findings/f42");
  });

  it("links a control event to the requirements filter matching that control's status", () => {
    const requirements = [
      {
        id: "r1",
        projectId: "p1",
        controlId: "ctl-button-name",
        status: "needs_review" as const,
        determination: "automated" as const,
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ];
    expect(
      evidenceRecordHref({ ...base, controlId: "ctl-button-name" }, requirements),
    ).toBe("/requirements?status=needs_review");
  });

  it("falls back to the requirements page when the control is not in scope", () => {
    const requirements = [
      {
        id: "r1",
        projectId: "p1",
        controlId: "ctl-button-name",
        status: "passed" as const,
        determination: "automated" as const,
        updatedAt: "",
      },
    ];
    expect(
      evidenceRecordHref(
        { ...base, controlId: "ctl-missing" },
        requirements,
      ),
    ).toBe("/requirements");
  });

  it("links an assessment event to the project home", () => {
    expect(
      evidenceRecordHref({ ...base, assessmentId: "a1" }, []),
    ).toBe("/");
  });

  it("returns undefined for records with no navigation target", () => {
    expect(evidenceRecordHref({ ...base }, [])).toBeUndefined();
  });
});