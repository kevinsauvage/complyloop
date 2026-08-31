import { describe, expect, it } from "vitest";
import type { Finding } from "./finding-types";
import {
  findingDetailHref,
  findingsListHref,
  parseFindingListParams,
} from "./finding-list-filter";
import { findingQueuePosition, orderedFindingIdsForQueue } from "./finding-queue";

const baseFinding = (id: string, severity: Finding["severity"]): Finding => ({
  id,
  projectId: "p1",
  controlId: "c1",
  assessmentId: "a1",
  checkId: "test",
  status: "open",
  kind: "violation",
  severity,
  reason: "test",
  confidence: "high",
  location: {
    kind: "source",
    filePath: "a.tsx",
    line: 1,
    column: 1,
    span: { start: 0, end: 1 },
    snippet: "",
  },
  fix: null,
  explanations: [],
  detectedAt: "2026-01-01T00:00:00.000Z",
});

describe("finding-queue", () => {
  it("preserves tab and page in list and detail hrefs", () => {
    const params = parseFindingListParams({ tab: "resolved", page: "3" });
    expect(findingsListHref(params)).toBe("/findings?tab=resolved&page=3");
    expect(findingDetailHref("f1", params)).toBe(
      "/findings/f1?tab=resolved&page=3",
    );
  });

  it("orders open findings by priority and exposes prev/next", () => {
    const findings = [
      baseFinding("minor", "minor"),
      baseFinding("critical", "critical"),
    ];
    const params = parseFindingListParams({});
    const ordered = orderedFindingIdsForQueue(findings, params, {
      controls: [],
      remediationStatusFor: () => undefined,
    });
    expect(ordered[0]).toBe("critical");

    const pos = findingQueuePosition(ordered, "critical");
    expect(pos.index).toBe(0);
    expect(pos.prevId).toBeNull();
    expect(pos.nextId).toBe("minor");
  });
});
