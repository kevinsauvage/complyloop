import "@/test-fixtures/register-action-workspace-mock";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../assessment/assessment-worker", () => ({
  processNextAssessmentJob: vi.fn(),
}));

import {
  drainAssessmentJobQueue,
  drainAssessmentJobsInline,
  shouldDrainAssessmentJobsInline,
} from "../assessment/assessment-job-inline";
import { processNextAssessmentJob } from "../assessment/assessment-worker";

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
    vi.stubEnv("E2E_PROD_HARNESS", "1");
    expect(shouldDrainAssessmentJobsInline()).toBe(true);
  });

  it("refuses the harness in production without the Playwright acknowledgement", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_AUTH_ENABLED", "1");
    vi.stubEnv("E2E_PROD_HARNESS", "");
    expect(() => shouldDrainAssessmentJobsInline()).toThrow(/E2E_PROD_HARNESS/);
  });
});

describe("drainAssessmentJobQueue", () => {
  it("stops when the queue is idle", async () => {
    processNext
      .mockResolvedValueOnce({ kind: "succeeded", jobId: "j1" })
      .mockResolvedValueOnce({ kind: "idle" });

    const outcome = await drainAssessmentJobQueue();

    expect(processNext).toHaveBeenCalledTimes(2);
    expect(outcome).toEqual({ ran: 1, failed: 0, retrying: 0 });
  });

  it("respects maxJobs", async () => {
    processNext.mockResolvedValue({ kind: "succeeded", jobId: "j1" });

    const outcome = await drainAssessmentJobQueue(3);

    expect(processNext).toHaveBeenCalledTimes(3);
    expect(outcome).toEqual({ ran: 3, failed: 0, retrying: 0 });
  });

  it("counts failed and retrying jobs so callers can surface honest messages", async () => {
    processNext
      .mockResolvedValueOnce({ kind: "failed", jobId: "j1" })
      .mockResolvedValueOnce({ kind: "retrying", jobId: "j2" })
      .mockResolvedValueOnce({ kind: "succeeded", jobId: "j3" })
      .mockResolvedValueOnce({ kind: "idle" });

    const outcome = await drainAssessmentJobQueue();

    expect(outcome).toEqual({ ran: 1, failed: 1, retrying: 1 });
  });
});

describe("drainAssessmentJobsInline", () => {
  it("maps drain outcomes to user copy", async () => {
    processNext
      .mockResolvedValueOnce({ kind: "succeeded", jobId: "j1" })
      .mockResolvedValueOnce({ kind: "idle" });
    await expect(drainAssessmentJobsInline()).resolves.toBe(
      "Assessment complete.",
    );

    processNext
      .mockResolvedValueOnce({ kind: "failed", jobId: "j1" })
      .mockResolvedValueOnce({ kind: "retrying", jobId: "j2" })
      .mockResolvedValueOnce({ kind: "idle" });
    await expect(drainAssessmentJobsInline()).resolves.toMatch(
      /1 assessment job failed and .* will retry/,
    );

    processNext
      .mockResolvedValueOnce({ kind: "failed", jobId: "j1" })
      .mockResolvedValueOnce({ kind: "idle" });
    await expect(drainAssessmentJobsInline()).resolves.toMatch(
      /failed\. Check the server logs/,
    );

    processNext
      .mockResolvedValueOnce({ kind: "retrying", jobId: "j1" })
      .mockResolvedValueOnce({ kind: "idle" });
    await expect(drainAssessmentJobsInline()).resolves.toMatch(
      /will retry automatically/,
    );

    processNext.mockResolvedValueOnce({ kind: "idle" });
    await expect(drainAssessmentJobsInline()).resolves.toBe(
      "No assessment jobs were ready to run.",
    );
  });
});
