import { describe, expect, it } from "vitest";

import type { Assessment } from "@complyloop/analysis-core/contract/entities";
import { REQUIREMENT_STATUSES } from "@complyloop/analysis-core/contract/statuses";

import {
  countByStatus,
  latestAssessmentFor,
  runtimeCoverageSummary,
} from "./assessment-helpers";

function assessment(
  partial: Pick<Assessment, "id" | "projectId" | "completedAt"> &
    Partial<Assessment>,
): Assessment {
  return {
    startedAt: partial.startedAt ?? partial.completedAt,
    filesScanned: 0,
    summary: {
      passed: 0,
      failed: 0,
      needs_review: 0,
      not_applicable: 0,
      unable_to_verify: 0,
    },
    ...partial,
  };
}

describe("latestAssessmentFor", () => {
  it("picks the newest completedAt regardless of array order", () => {
    const older = assessment({
      id: "a1",
      projectId: "p1",
      completedAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = assessment({
      id: "a2",
      projectId: "p1",
      completedAt: "2026-06-01T00:00:00.000Z",
    });
    expect(latestAssessmentFor([newer, older], "p1")?.id).toBe("a2");
    expect(latestAssessmentFor([older, newer], "p1")?.id).toBe("a2");
  });

  it("ignores other projects", () => {
    expect(
      latestAssessmentFor(
        [
          assessment({
            id: "other",
            projectId: "p2",
            completedAt: "2026-09-01T00:00:00.000Z",
          }),
          assessment({
            id: "mine",
            projectId: "p1",
            completedAt: "2026-01-01T00:00:00.000Z",
          }),
        ],
        "p1",
      )?.id,
    ).toBe("mine");
  });
});

describe("runtimeCoverageSummary", () => {
  it("returns source only when no preview URL is configured", () => {
    expect(runtimeCoverageSummary({ runtimeBaseUrl: undefined })).toEqual({
      mode: "source_only",
      label: "Source only",
      pagesScanned: null,
      runtimeError: null,
    });
  });

  it("returns source + preview with page count when runtime ran", () => {
    expect(
      runtimeCoverageSummary(
        { runtimeBaseUrl: "https://app.example.com" },
        { ast: true, runtime: true, runtimePagesScanned: 3 },
      ),
    ).toEqual({
      mode: "source_and_preview",
      label: "Source + preview (3 pages)",
      pagesScanned: 3,
      runtimeError: null,
    });
  });

  it("surfaces last runtime error from assessment engines", () => {
    expect(
      runtimeCoverageSummary(
        { runtimeBaseUrl: "https://app.example.com" },
        { ast: true, runtime: false, runtimeError: "Connection refused" },
      ).runtimeError,
    ).toBe("Connection refused");
  });
});

describe("countByStatus", () => {
  it("zero-fills every status and counts known ones", () => {
    const items = [
      { status: "passed" as const },
      { status: "failed" as const },
      { status: "failed" as const },
      { status: "needs_review" as const },
    ];
    const record = countByStatus(items, REQUIREMENT_STATUSES);

    expect(record.passed).toBe(1);
    expect(record.failed).toBe(2);
    expect(record.needs_review).toBe(1);
    expect(record.not_applicable).toBe(0);
    expect(record.unable_to_verify).toBe(0);
  });
});
