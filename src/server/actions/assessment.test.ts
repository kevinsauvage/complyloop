import "@/test-fixtures/register-action-workspace-mock";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../assessment-worker", () => ({
  processNextAssessmentJob: vi.fn(),
}));

import { processNextAssessmentJob } from "../assessment-worker";
import {
  drainAssessmentJobQueue,
  shouldDrainAssessmentJobsInline,
} from "../assessment-job-inline";

const processNext = vi.mocked(processNextAssessmentJob);

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("shouldDrainAssessmentJobsInline", () => {
  it("is true in development and when the e2e harness is enabled", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_AUTH_ENABLED", "");
    expect(shouldDrainAssessmentJobsInline()).toBe(true);

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_AUTH_ENABLED", "");
    expect(shouldDrainAssessmentJobsInline()).toBe(false);

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_AUTH_ENABLED", "1");
    expect(shouldDrainAssessmentJobsInline()).toBe(true);
  });
});

describe("drainAssessmentJobQueue", () => {
  it("stops when the queue is idle", async () => {
    processNext
      .mockResolvedValueOnce({ kind: "succeeded", jobId: "j1" })
      .mockResolvedValueOnce({ kind: "idle" });

    await drainAssessmentJobQueue();

    expect(processNext).toHaveBeenCalledTimes(2);
  });

  it("respects maxJobs", async () => {
    processNext.mockResolvedValue({ kind: "succeeded", jobId: "j1" });

    await drainAssessmentJobQueue(3);

    expect(processNext).toHaveBeenCalledTimes(3);
  });
});
