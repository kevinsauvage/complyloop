import "@/test-fixtures/register-action-workspace-mock";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../assessment/assessment-worker", () => ({
  processNextAssessmentJob: vi.fn(),
}));

vi.mock("../observability", () => ({
  reportEvent: vi.fn(),
  reportWarning: vi.fn(),
}));

import {
  drainAssessmentJobQueue,
  drainAssessmentJobsInline,
  scheduleAssessmentDrain,
  shouldDrainAssessmentJobsInline,
} from "../assessment/assessment-job-inline";
import { processNextAssessmentJob } from "../assessment/assessment-worker";

const processNext = vi.mocked(processNextAssessmentJob);

beforeEach(() => {
  vi.stubEnv("AUTH_URL", "https://app.example.com");
  vi.stubEnv("WORKER_SECRET", "test-worker-secret");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
    expect(outcome).toEqual({ ran: 1, failed: 0, retrying: 0, cancelled: 0 });
  });

  it("respects maxJobs", async () => {
    processNext.mockResolvedValue({ kind: "succeeded", jobId: "j1" });

    const outcome = await drainAssessmentJobQueue(3);

    expect(processNext).toHaveBeenCalledTimes(3);
    expect(outcome).toEqual({ ran: 3, failed: 0, retrying: 0, cancelled: 0 });
  });

  it("counts failed and retrying jobs so callers can surface honest messages", async () => {
    processNext
      .mockResolvedValueOnce({ kind: "failed", jobId: "j1" })
      .mockResolvedValueOnce({ kind: "retrying", jobId: "j2" })
      .mockResolvedValueOnce({ kind: "succeeded", jobId: "j3" })
      .mockResolvedValueOnce({ kind: "idle" });

    const outcome = await drainAssessmentJobQueue();

    expect(outcome).toEqual({ ran: 1, failed: 1, retrying: 1, cancelled: 0 });
  });

  it("counts cancelled jobs separately from runs and failures", async () => {
    processNext
      .mockResolvedValueOnce({ kind: "cancelled", jobId: "j1" })
      .mockResolvedValueOnce({ kind: "idle" });

    const outcome = await drainAssessmentJobQueue();

    expect(outcome).toEqual({ ran: 0, failed: 0, retrying: 0, cancelled: 1 });
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

  it("maps cancelled jobs to cancel copy", async () => {
    processNext
      .mockResolvedValueOnce({ kind: "cancelled", jobId: "j1" })
      .mockResolvedValueOnce({ kind: "idle" });
    await expect(drainAssessmentJobsInline()).resolves.toBe(
      "Assessment cancelled.",
    );
  });
});

describe("scheduleAssessmentDrain", () => {
  it("drains inline in development and returns the user copy", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_AUTH_ENABLED", "");
    processNext
      .mockResolvedValueOnce({ kind: "succeeded", jobId: "j1" })
      .mockResolvedValueOnce({ kind: "idle" });

    await expect(scheduleAssessmentDrain()).resolves.toBe(
      "Assessment complete.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("self-fetches the worker route in production and returns undefined", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_AUTH_ENABLED", "");

    await expect(scheduleAssessmentDrain()).resolves.toBeUndefined();
    expect(processNext).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "https://app.example.com/api/internal/jobs/run?limit=1",
      {
        method: "POST",
        headers: { authorization: "Bearer test-worker-secret" },
      },
    );
  });

  it("never throws when the self-fetch fails", async () => {
    const { reportWarning } = await import("../observability");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_AUTH_ENABLED", "");
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));

    await expect(scheduleAssessmentDrain()).resolves.toBeUndefined();
    expect(reportWarning).toHaveBeenCalledWith(
      "opportunistic assessment drain failed",
      expect.objectContaining({
        code: "assessment_opportunistic_drain_failed",
      }),
    );
  });

  it("never throws when the worker route responds with an error", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_AUTH_ENABLED", "");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("error", { status: 503 }),
    );

    await expect(scheduleAssessmentDrain()).resolves.toBeUndefined();
  });

  it("never throws when AUTH_URL or WORKER_SECRET is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_AUTH_ENABLED", "");
    vi.stubEnv("AUTH_URL", "");

    await expect(scheduleAssessmentDrain()).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
