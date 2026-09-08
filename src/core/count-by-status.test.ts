import { describe, expect, it } from "vitest";
import { REQUIREMENT_STATUSES } from "@complyloop/analysis-core/contract/statuses";
import { countByStatus } from "./count-by-status";

describe("countByStatus", () => {
  it("zero-fills every status and counts known ones", () => {
    const items = [
      { status: "passed" as const },
      { status: "failed" as const },
      { status: "failed" as const },
      { status: "needs_review" as const },
    ];
    const record = countByStatus(items, REQUIREMENT_STATUSES);

    expect(record.passed).toBe(1);
    expect(record.failed).toBe(2);
    expect(record.needs_review).toBe(1);
    expect(record.not_applicable).toBe(0);
    expect(record.unable_to_verify).toBe(0);
  });
});
