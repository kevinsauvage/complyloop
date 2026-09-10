import { describe, expect, it } from "vitest";
import { assessmentJobsResponseSchema } from "./assessment-jobs";

describe("assessmentJobsResponseSchema", () => {
  it("accepts a job list and rejects a missing jobs array", () => {
    const ok = {
      jobs: [
        {
          id: "job-1",
          projectId: "p1",
          status: "queued",
          trigger: "manual",
          payload: {},
          attempts: 0,
          maxAttempts: 3,
          availableAt: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    expect(assessmentJobsResponseSchema.parse(ok).jobs).toHaveLength(1);
    expect(assessmentJobsResponseSchema.safeParse({ jobs: null }).success).toBe(
      false,
    );
  });
});
