import { describe, expect, it } from "vitest";
import {
  findingPriorityScore,
  prioritizeClusters,
  prioritizeFindings,
} from "./prioritization";
import type { Control } from "./project-types";
import type { Finding } from "./finding-types";

function finding(
  id: string,
  checkId: string,
  filePath: string,
  severity: Finding["severity"] = "serious",
): Finding {
  return {
    id,
    projectId: "p1",
    controlId: "ctl",
    assessmentId: "a1",
    checkId,
    status: "open",
    kind: "violation",
    severity,
    confidence: "high",
    reason: "fail",
    location: {
      kind: "source",
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
    code: "WCAG",
    secondaryCode: "RGAA",
    title: "Images have a text alternative",
    description: "d",
    checkId: "img-alt",
  },
];

describe("prioritization", () => {
  it("scores critical findings higher than moderate ones", () => {
    const critical = finding("1", "img-alt", "a.tsx", "critical");
    const moderate = finding("2", "img-alt", "b.tsx", "moderate");
    expect(findingPriorityScore(critical, 1)).toBeGreaterThan(
      findingPriorityScore(moderate, 1),
    );
  });

  it("boosts findings that share a root-cause cluster", () => {
    const list = [
      finding("1", "img-alt", "components/Card.tsx", "serious"),
      finding("2", "img-alt", "components/Card.tsx", "serious"),
      finding("3", "img-alt", "solo.tsx", "moderate"),
    ];
    const ordered = prioritizeFindings(list, controls);
    expect(ordered[0].id).not.toBe("3");
    expect(["1", "2"]).toContain(ordered[0].id);
  });

  it("applies control complianceWeight to the score", () => {
    const weighted: Control[] = [
      { ...controls[0], id: "ctl-hi", complianceWeight: 2 },
      { ...controls[0], id: "ctl-lo", complianceWeight: 1 },
    ];
    const hi = { ...finding("1", "img-alt", "a.tsx", "serious"), controlId: "ctl-hi" };
    const lo = { ...finding("2", "img-alt", "b.tsx", "serious"), controlId: "ctl-lo" };
    expect(findingPriorityScore(hi, 1, weighted)).toBeGreaterThan(
      findingPriorityScore(lo, 1, weighted),
    );
  });

  it("ranks clusters by combined priority", () => {
    const clusters = prioritizeClusters(
      [
        finding("1", "img-alt", "components/A.tsx"),
        finding("2", "img-alt", "components/B.tsx"),
        finding("3", "img-alt", "components/C.tsx"),
      ],
      controls,
    );
    expect(clusters[0]?.occurrenceCount).toBe(3);
    expect(clusters[0]?.priorityScore).toBeGreaterThan(0);
  });

  it("orders multiple clusters by descending priority score", () => {
    // Two distinct directories each yield a cluster; the higher-severity
    // cluster must sort first.
    const clusters = prioritizeClusters(
      [
        finding("1", "img-alt", "dir/a/A.tsx", "critical"),
        finding("2", "img-alt", "dir/a/B.tsx", "critical"),
        finding("3", "img-alt", "dir/b/C.tsx", "moderate"),
        finding("4", "img-alt", "dir/b/D.tsx", "moderate"),
      ],
      controls,
    );
    expect(clusters.length).toBeGreaterThan(1);
    const first = clusters[0];
    expect(first?.priorityScore).toBeGreaterThanOrEqual(
      (clusters[1]?.priorityScore ?? 0),
    );
  });
});
