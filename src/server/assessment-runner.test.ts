import { beforeEach, describe, expect, it, vi } from "vitest";

const processNextAssessmentJob = vi.hoisted(() => vi.fn());

vi.mock("./assessment-worker", () => ({
  processNextAssessmentJob: (...args: unknown[]) =>
    processNextAssessmentJob(...args),
}));

import { runAssessmentJobBatch } from "./assessment-runner";

describe("runAssessmentJobBatch", () => {
  beforeEach(() => {
    processNextAssessmentJob.mockReset();
  });

  it("runs sequentially and stops on the first idle", async () => {
    processNextAssessmentJob
      .mockResolvedValueOnce({ kind: "succeeded", jobId: "j1" })
      .mockResolvedValueOnce({ kind: "idle" });

    const results = await runAssessmentJobBatch(5);

    expect(processNextAssessmentJob).toHaveBeenCalledTimes(2);
    expect(results.map((result) => result.kind)).toEqual([
      "succeeded",
      "idle",
    ]);
  });

  it("runs a bounded pool without exceeding the limit", async () => {
    processNextAssessmentJob.mockResolvedValue({
      kind: "succeeded",
      jobId: "j",
    });

    const results = await runAssessmentJobBatch({ limit: 3, concurrency: 2 });

    expect(processNextAssessmentJob).toHaveBeenCalledTimes(3);
    expect(results).toHaveLength(3);
  });

  it("stops the pool on an idle claim", async () => {
    processNextAssessmentJob.mockResolvedValue({ kind: "idle" });

    const results = await runAssessmentJobBatch({ limit: 2, concurrency: 2 });

    expect(processNextAssessmentJob).toHaveBeenCalledTimes(2);
    expect(results.every((result) => result.kind === "idle")).toBe(true);
  });
});
