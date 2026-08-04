import { describe, expect, it } from "vitest";
import { clusterFindings } from "./root-cause";
import type { Control, Finding } from "./types";

function finding(
  id: string,
  checkId: string,
  filePath: string,
  controlId = "ctl",
): Finding {
  return {
    id,
    projectId: "p1",
    controlId,
    assessmentId: "a1",
    checkId,
    status: "open",
    kind: "violation",
    severity: "serious",
    confidence: "high",
    reason: "fail",
    location: {
      filePath,
      line: 1,
      column: 1,
      snippet: "<x />",
      span: { start: 0, end: 1 },
    },
    fix: null,
    explanations: [],
    detectedAt: "2026-01-01T00:00:00.000Z",
  };
}

const controls: Control[] = [
  {
    id: "ctl",
    frameworkId: "fw",
    code: "WCAG 1.1.1",
    secondaryCode: "RGAA 1.1",
    title: "Images have a text alternative",
    description: "desc",
    checkId: "img-alt",
  },
];

describe("clusterFindings", () => {
  it("groups multiple findings in the same file", () => {
    const clusters = clusterFindings(
      [
        finding("1", "img-alt", "components/ProductCard.tsx"),
        finding("2", "img-alt", "components/ProductCard.tsx"),
        finding("3", "img-alt", "app/page.tsx"),
      ],
      controls,
    );
    expect(clusters.some((cluster) => cluster.sharedLocation === "ProductCard.tsx")).toBe(
      true,
    );
    expect(
      clusters.find((cluster) => cluster.sharedLocation === "ProductCard.tsx")
        ?.findingIds,
    ).toHaveLength(2);
  });

  it("groups findings that share a directory across files", () => {
    const clusters = clusterFindings(
      [
        finding("1", "img-alt", "components/A.tsx"),
        finding("2", "img-alt", "components/B.tsx"),
      ],
      controls,
    );
    expect(clusters.some((cluster) => cluster.sharedLocation === "components/")).toBe(
      true,
    );
  });

  it("ignores singleton findings", () => {
    expect(
      clusterFindings([finding("1", "img-alt", "solo.tsx")], controls),
    ).toHaveLength(0);
  });
});
