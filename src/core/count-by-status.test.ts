import { describe, expect, it } from "vitest";
import { REQUIREMENT_STATUSES } from "@complyloop/analysis-core/contract/statuses";
import { countByStatus, toCountMap } from "./count-by-status";

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

describe("toCountMap", () => {
  it("counts items by derived key", () => {
    const items = [
      { id: "a", controlId: "c1" },
      { id: "b", controlId: "c1" },
      { id: "c", controlId: "c2" },
    ];
    const map = toCountMap(items, (item) => item.controlId);

    expect(map.get("c1")).toBe(2);
    expect(map.get("c2")).toBe(1);
    expect(map.get("c3")).toBeUndefined();
  });
});
