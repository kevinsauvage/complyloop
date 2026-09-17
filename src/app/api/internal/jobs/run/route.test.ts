import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const runAssessmentJobBatch = vi.hoisted(() => vi.fn());
const isWorkerAuthConfigured = vi.hoisted(() => vi.fn());
const isWorkerRequestAuthorized = vi.hoisted(() => vi.fn());
const assertRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/server/assessment/assessment-scheduler", () => ({
  runAssessmentJobBatch: (...args: unknown[]) =>
    runAssessmentJobBatch(...args),
}));

vi.mock("@/server/assessment/worker-auth", () => ({
  isWorkerAuthConfigured: () => isWorkerAuthConfigured(),
  isWorkerRequestAuthorized: (...args: unknown[]) =>
    isWorkerRequestAuthorized(...args),
}));

vi.mock("@/server/rate-limit", () => ({
  assertRateLimit: (...args: unknown[]) => assertRateLimit(...args),
  RateLimitError: class RateLimitError extends Error {},
}));

vi.mock("@/server/observability", () => ({
  reportError: vi.fn(),
  reportEvent: vi.fn(),
  reportWarning: vi.fn(),
}));

function workerRequest(): Request {
  return new Request("http://localhost/api/internal/jobs/run?limit=2", {
    method: "POST",
    headers: { authorization: "Bearer secret" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  isWorkerAuthConfigured.mockReturnValue(true);
  isWorkerRequestAuthorized.mockReturnValue(true);
  assertRateLimit.mockResolvedValue(undefined);
});

describe("POST /api/internal/jobs/run", () => {
  it("returns batch results on success", async () => {
    runAssessmentJobBatch.mockResolvedValue([{ kind: "succeeded" }]);
    const response = await POST(workerRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      results: [{ kind: "succeeded" }],
    });
  });

  it("reports batch-level crashes to Sentry instead of failing silently", async () => {
    const { reportError } = await import("@/server/observability");
    runAssessmentJobBatch.mockRejectedValueOnce(new Error("db down"));
    const response = await POST(workerRequest());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Assessment batch failed.",
    });
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), {
      code: "worker_batch_failed",
      limit: 2,
      concurrency: 1,
    });
  });
});
