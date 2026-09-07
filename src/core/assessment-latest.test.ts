import { describe, expect, it } from "vitest";
import type { Assessment } from "@complyloop/db/types";
import { latestAssessmentFor } from "./assessment";

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
