import { describe, expect, it } from "vitest";

import type { EvidenceRecord } from "@complyloop/analysis-core/contract/entities";

import { activeRegressions } from "./active-regressions";

function regression(
  id: string,
  controlId: string,
  projectId = "p1",
): EvidenceRecord {
  return {
    id,
    projectId,
    controlId,
    kind: "requirement_status_changed",
    summary: id,
    at: "2026-10-19T21:39:00.000Z",
    detail: { from: "passed", to: "failed", regression: true },
  } as EvidenceRecord;
}

describe("activeRegressions", () => {
  it("keeps a regression while the requirement is still failed", () => {
    const result = activeRegressions(
      [regression("r1", "c1")],
      [{ controlId: "c1", status: "failed" }],
      "p1",
    );
    expect(result.map((record) => record.id)).toEqual(["r1"]);
  });

  it("drops a regression once a later assessment recovered the requirement", () => {
    const result = activeRegressions(
      [regression("r1", "c1"), regression("r2", "c2")],
      [
        { controlId: "c1", status: "passed" },
        { controlId: "c2", status: "failed" },
      ],
      "p1",
    );
    expect(result.map((record) => record.id)).toEqual(["r2"]);
  });

  it("ignores other projects and non-regression records, newest first, capped", () => {
    const records = [
      regression("a", "c1"),
      regression("b", "c1"),
      regression("c", "c1"),
      regression("d", "c1"),
      regression("other", "c1", "p2"),
    ];
    const result = activeRegressions(
      records,
      [{ controlId: "c1", status: "failed" }],
      "p1",
      3,
    );
    expect(result.map((record) => record.id)).toEqual(["d", "c", "b"]);
  });
});
