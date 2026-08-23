import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./assessment-worker", () => ({
  processNextAssessmentJob: vi.fn(),
}));

import { processNextAssessmentJob } from "./assessment-worker";
import {
  drainAssessmentJobQueue,
  shouldDrainAssessmentJobsInline,
} from "./assessment-job-drain";

const processNext = vi.mocked(processNextAssessmentJob);

afterEach(() => {
  vi.clearAllMocks();
});

describe("shouldDrainAssessmentJobsInline", () => {
  it("is true only in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(shouldDrainAssessmentJobsInline()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(shouldDrainAssessmentJobsInline()).toBe(false);
    vi.unstubAllEnvs();
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
