import { describe, expect, it } from "vitest";

import { parseAssessmentJobsResponse } from "./assessment-job-guard";
import type { AssessmentJob } from "./assessment-jobs";
import { assessmentJobsResponseSchema } from "./assessment-jobs";

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

  it("rejects unknown status/trigger values", () => {
    expect(() =>
      parseAssessmentJobsResponse({
        jobs: [job({ status: "bogus" as AssessmentJob["status"] })],
      }),
    ).toThrow();
    expect(() =>
      parseAssessmentJobsResponse({
        jobs: [job({ trigger: "bogus" as AssessmentJob["trigger"] })],
      }),
    ).toThrow();
  });

  it("accepts everything the zod response schema produces", () => {
    // The guard is hand-written (no zod in the client bundle) and
    // intentionally lossy — but it must never reject a shape the server
    // schema emits. This pins the two together across edits.
    const jobs = [
      job(),
      job({
        id: "job-2",
        status: "cancelled",
        trigger: "webhook",
        requestedByUserId: "u1",
        idempotencyKey: "delivery-1",
        payload: {
          ref: "abc123",
          eventName: "push",
          supersededRefs: ["def456"],
        },
        startedAt: "2026-01-01T00:01:00.000Z",
        leaseExpiresAt: "2026-01-01T00:31:00.000Z",
        completedAt: "2026-01-01T00:02:00.000Z",
        error: "boom",
      }),
    ];
    const parsed = assessmentJobsResponseSchema.parse({ jobs });
    expect(parseAssessmentJobsResponse(parsed)).toEqual(jobs);
  });
});
