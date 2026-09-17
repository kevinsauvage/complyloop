import { describe, expect, it } from "vitest";

import {
  DEFAULT_OPS_THRESHOLDS,
  evaluateOpsStatus,
  evidenceBytesFromMb,
} from "./ops-thresholds";

const healthy = {
  queuedJobs: 3,
  evidenceBytes: evidenceBytesFromMb(100),
  evidenceRowsEstimate: 12_000,
};

describe("evaluateOpsStatus", () => {
  it("passes healthy signals", () => {
    expect(evaluateOpsStatus(healthy).ok).toBe(true);
  });

  it("fails when the queue grows past the threshold", () => {
    const result = evaluateOpsStatus(
      { ...healthy, queuedJobs: 51 },
      { ...DEFAULT_OPS_THRESHOLDS, maxQueuedJobs: 50 },
    );
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/queuedJobs 51 exceeds max 50/);
  });

  it("fails when the evidence table grows past the threshold", () => {
    const result = evaluateOpsStatus({
      ...healthy,
      evidenceBytes: evidenceBytesFromMb(2048),
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/evidence size .* exceeds max/);
  });

  it("fails closed on unusable counts instead of passing silently", () => {
    const result = evaluateOpsStatus({ ...healthy, queuedJobs: NaN });
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/not a usable count/);
  });

  it("reports every breach, not just the first", () => {
    const result = evaluateOpsStatus({
      queuedJobs: 999,
      evidenceBytes: evidenceBytesFromMb(9999),
      evidenceRowsEstimate: 999_999,
    });
    expect(result.failures).toHaveLength(2);
  });
});
