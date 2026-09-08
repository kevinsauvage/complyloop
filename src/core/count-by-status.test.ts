import { describe, expect, it } from "vitest";
import { REQUIREMENT_STATUSES } from "@complyloop/analysis-core/contract/statuses";
import { countByStatus, countByStatusMap } from "./count-by-status";

describe("countByStatusMap", () => {
  it("matches countByStatus values for the same input", () => {
    const items = [
      { status: "passed" as const },
      { status: "failed" as const },
      { status: "failed" as const },
      { status: "needs_review" as const },
    ];
    const record = countByStatus(items, REQUIREMENT_STATUSES);
    const map = countByStatusMap(items, REQUIREMENT_STATUSES);

    for (const status of REQUIREMENT_STATUSES) {
      expect(map.get(status)).toBe(record[status]);
    }
    expect(map.get("passed")).toBe(1);
    expect(map.get("failed")).toBe(2);
    expect(map.get("not_applicable")).toBe(0);
    expect(map.get("unable_to_verify")).toBe(0);
  });
});
