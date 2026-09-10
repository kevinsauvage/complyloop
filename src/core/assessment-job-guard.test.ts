import { describe, expect, it } from "vitest";
import { parseAssessmentJobsResponse } from "./assessment-job-guard";
import type { AssessmentJob } from "./assessment-jobs";

function job(overrides: Partial<AssessmentJob> = {}): AssessmentJob {
  return {
    id: "job-1",
    projectId: "p1",
    status: "running",
    trigger: "manual",
    payload: {},
    attempts: 0,
    maxAttempts: 3,
    availableAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseAssessmentJobsResponse", () => {
  it("accepts a jobs payload and returns the array", () => {
    const jobs = [job(), job({ id: "job-2", status: "queued" })];
    expect(parseAssessmentJobsResponse({ jobs })).toEqual(jobs);
  });

  it("rejects a malformed payload", () => {
    expect(() => parseAssessmentJobsResponse(null)).toThrow();
    expect(() => parseAssessmentJobsResponse({ jobs: null })).toThrow();
    expect(() =>
      parseAssessmentJobsResponse({ jobs: [{ id: "job-1" }] }),
    ).toThrow();
  });
});
