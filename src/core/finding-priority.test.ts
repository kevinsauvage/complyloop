import { describe, expect, it } from "vitest";

import type { Finding } from "@complyloop/analysis-core/contract/entities";
import type { Control } from "@complyloop/analysis-core/contract/project-types";

import {
  clusterFindings,
  prioritizeClusters,
  prioritizeFindings,
  unableToVerifyReason,
  unableToVerifyReasonLabel,
} from "./finding-priority";

function rootCauseFinding(
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

function rootCauseDomFinding(
  id: string,
  checkId: string,
  url: string,
): Finding {
  return {
    id,
    projectId: "p1",
    controlId: "ctl",
    assessmentId: "a1",
    checkId,
    status: "open",
    kind: "violation",
    severity: "serious",
    confidence: "high",
    reason: "fail",
    location: {
      kind: "dom",
      url,
      selector: "img",
      snippet: "<img>",
    },
    fix: null,
    explanations: [],
    detectedAt: "2026-01-01T00:00:00.000Z",
  };
}

const rootCauseControls: Control[] = [
  {
    id: "ctl",
    frameworkId: "fw",
    code: "WCAG 1.1.1",
    secondaryCode: "RGAA 1.1",
    title: "Images have a text alternative",
    description: "desc",
    checkId: "img-alt",
  },
  {
    id: "ctl-form-error",
    frameworkId: "fw",
    code: "WCAG 3.3.1",
    secondaryCode: "RGAA 11.10",
    title: "Form errors are associated with fields",
    description: "desc",
    checkId: "form-error-association",
  },
];

describe("clusterFindings", () => {
  it("groups multiple findings in the same file", () => {
    const clusters = clusterFindings(
      [
        rootCauseFinding("1", "img-alt", "components/ProductCard.tsx"),
        rootCauseFinding("2", "img-alt", "components/ProductCard.tsx"),
        rootCauseFinding("3", "img-alt", "app/page.tsx"),
      ],
      rootCauseControls,
    );
    expect(
      clusters.some(
        (cluster) => cluster.sharedLocation === "components/ProductCard.tsx",
      ),
    ).toBe(true);
    expect(
      clusters.find(
        (cluster) => cluster.sharedLocation === "components/ProductCard.tsx",
      )?.findingIds,
    ).toHaveLength(2);
  });

  it("does not merge files that share a basename across directories", () => {
    const clusters = clusterFindings(
      [
        rootCauseFinding("1", "img-alt", "app/page.tsx"),
        rootCauseFinding("2", "img-alt", "src/legacy/page.tsx"),
      ],
      rootCauseControls,
    );
    expect(
      clusters.filter((cluster) => cluster.id.includes(":file:")),
    ).toHaveLength(0);
  });

  it("groups findings that share a directory across files", () => {
    const clusters = clusterFindings(
      [
        rootCauseFinding("1", "img-alt", "components/A.tsx"),
        rootCauseFinding("2", "img-alt", "components/B.tsx"),
      ],
      rootCauseControls,
    );
    expect(
      clusters.some((cluster) => cluster.sharedLocation === "components/"),
    ).toBe(true);
  });

  it("ignores singleton findings", () => {
    expect(
      clusterFindings(
        [rootCauseFinding("1", "img-alt", "solo.tsx")],
        rootCauseControls,
      ),
    ).toHaveLength(0);
  });

  it("clusters ContactForm-style repeated form-error findings in one file", () => {
    const clusters = clusterFindings(
      [
        rootCauseFinding(
          "f1",
          "form-error-association",
          "src/components/features/contact/ContactForm.tsx",
          "ctl-form-error",
        ),
        rootCauseFinding(
          "f2",
          "form-error-association",
          "src/components/features/contact/ContactForm.tsx",
          "ctl-form-error",
        ),
        rootCauseFinding(
          "f3",
          "form-error-association",
          "src/components/features/contact/ContactForm.tsx",
          "ctl-form-error",
        ),
      ],
      rootCauseControls,
    );
    const fileCluster = clusters.find(
      (cluster) =>
        cluster.sharedLocation ===
        "src/components/features/contact/ContactForm.tsx",
    );
    expect(fileCluster).toBeDefined();
    expect(fileCluster?.checkId).toBe("form-error-association");
    expect(fileCluster?.findingIds).toEqual(["f1", "f2", "f3"]);
    expect(fileCluster?.label).toContain(
      "Form errors are associated with fields",
    );
  });

  it("clusters DOM findings that share a URL", () => {
    const clusters = clusterFindings(
      [
        rootCauseDomFinding(
          "d1",
          "color-contrast",
          "https://preview.example.com/",
        ),
        rootCauseDomFinding(
          "d2",
          "color-contrast",
          "https://preview.example.com/",
        ),
        rootCauseDomFinding(
          "d3",
          "color-contrast",
          "https://preview.example.com/other",
        ),
      ],
      rootCauseControls,
    );
    const urlCluster = clusters.find(
      (cluster) => cluster.sharedLocation === "https://preview.example.com/",
    );
    expect(urlCluster).toBeDefined();
    expect(urlCluster?.findingIds).toEqual(["d1", "d2"]);
    expect(urlCluster?.label).toContain("color-contrast");
  });

  it("clusters findings that share a PascalCase component across paths", () => {
    const clusters = clusterFindings(
      [
        rootCauseFinding("1", "img-alt", "src/ui/Button.tsx"),
        rootCauseFinding("2", "img-alt", "src/legacy/Button.tsx"),
      ],
      rootCauseControls,
    );
    const componentCluster = clusters.find(
      (cluster) => cluster.sharedLocation === "Button",
    );
    expect(componentCluster).toBeDefined();
    expect(componentCluster?.findingIds).toEqual(["1", "2"]);
    expect(componentCluster?.label).toContain("component `Button`");
  });

  it("does not form a component cluster for a single path basename", () => {
    const clusters = clusterFindings(
      [
        rootCauseFinding("1", "img-alt", "src/ui/Button.tsx"),
        rootCauseFinding("2", "img-alt", "src/ui/Button.tsx"),
      ],
      rootCauseControls,
    );
    expect(clusters.some((cluster) => cluster.id.includes(":component:"))).toBe(
      false,
    );
  });

  it("uses (project root) for files without a directory and skips closed findings", () => {
    const clusters = clusterFindings(
      [
        rootCauseFinding("1", "img-alt", "RootA.tsx"),
        rootCauseFinding("2", "img-alt", "RootB.tsx"),
        {
          ...rootCauseFinding("3", "img-alt", "RootC.tsx"),
          status: "resolved",
        },
      ],
      rootCauseControls,
    );
    expect(
      clusters.some((cluster) => cluster.sharedLocation === "(project root)"),
    ).toBe(true);
  });
});

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
  it("orders critical findings before moderate ones", () => {
    const critical = finding("1", "img-alt", "a.tsx", "critical");
    const moderate = finding("2", "img-alt", "b.tsx", "moderate");
    const ordered = prioritizeFindings([moderate, critical], controls);
    expect(ordered.map((f) => f.id)).toEqual(["1", "2"]);
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

  it("applies control complianceWeight when ordering", () => {
    const weighted: Control[] = [
      { ...controls[0], id: "ctl-hi", complianceWeight: 2 },
      { ...controls[0], id: "ctl-lo", complianceWeight: 1 },
    ];
    const hi = {
      ...finding("1", "img-alt", "a.tsx", "serious"),
      controlId: "ctl-hi",
    };
    const lo = {
      ...finding("2", "img-alt", "b.tsx", "serious"),
      controlId: "ctl-lo",
    };
    const ordered = prioritizeFindings([lo, hi], weighted);
    expect(ordered.map((f) => f.id)).toEqual(["1", "2"]);
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
      clusters[1]?.priorityScore ?? 0,
    );
  });

  it("reuses precomputed clusters without re-deriving membership", () => {
    const list = [
      finding("1", "img-alt", "components/Card.tsx", "serious"),
      finding("2", "img-alt", "components/Card.tsx", "serious"),
      finding("3", "img-alt", "solo.tsx", "moderate"),
    ];
    const raw = clusterFindings(list, controls);
    const ordered = prioritizeFindings([list[2]!, list[0]!], controls, raw);
    // Full-set cluster size still boosts finding 1 over the solo moderate.
    expect(ordered[0]?.id).toBe("1");
    const ranked = prioritizeClusters(list, controls, raw);
    expect(ranked[0]?.findingIds).toEqual(raw[0]?.findingIds);
  });
});

describe("unableToVerifyReason", () => {
  it("flags missing preview URL for runtime-only checks", () => {
    expect(
      unableToVerifyReason(
        { checkId: "color-contrast" },
        {},
        { isRuntimeOnlyCheck: true },
      ),
    ).toBe("needs_preview_url");
  });

  it("flags human-only controls", () => {
    expect(
      unableToVerifyReason(
        { checkId: null },
        { runtimeBaseUrl: "https://app.example.com" },
        { isRuntimeOnlyCheck: false },
      ),
    ).toBe("needs_human_review");
  });

  it("labels reasons in engineer language", () => {
    expect(unableToVerifyReasonLabel("needs_preview_url")).toMatch(
      /preview URL/i,
    );
    expect(unableToVerifyReasonLabel("needs_human_review")).toMatch(
      /human review/i,
    );
    expect(unableToVerifyReasonLabel("needs_pertinence_review")).toMatch(
      /Presence checked/i,
    );
    expect(unableToVerifyReasonLabel("needs_heuristic_review")).toMatch(
      /not a pass/i,
    );
  });

  it("uses pertinence copy for presence/pertinence twins", () => {
    expect(
      unableToVerifyReason(
        { checkId: null },
        {},
        { isRuntimeOnlyCheck: false, isPertinenceTwin: true },
      ),
    ).toBe("needs_pertinence_review");
  });

  it("uses heuristic copy when no suspicious pattern was found", () => {
    expect(
      unableToVerifyReason(
        { checkId: "pointer-gesture" },
        {},
        { isRuntimeOnlyCheck: false, isHeuristicCheck: true },
      ),
    ).toBe("needs_heuristic_review");
  });

  it("returns runtime_only_pending when a runtime-only check had a reachable preview", () => {
    expect(
      unableToVerifyReason(
        { checkId: "color-contrast" },
        { runtimeBaseUrl: "https://app.example.com" },
        { isRuntimeOnlyCheck: true },
      ),
    ).toBe("runtime_only_pending");
  });

  it("returns non_scorable for a scorable check with no preview and no runtime requirement", () => {
    expect(
      unableToVerifyReason(
        { checkId: "duplicate-id" },
        {},
        { isRuntimeOnlyCheck: false },
      ),
    ).toBe("non_scorable");
  });

  it("labels every reason without throw", () => {
    const reasons = [
      "needs_preview_url",
      "needs_human_review",
      "needs_pertinence_review",
      "needs_heuristic_review",
      "runtime_only_pending",
      "non_scorable",
    ] as const;
    for (const reason of reasons) {
      expect(unableToVerifyReasonLabel(reason).length).toBeGreaterThan(0);
    }
    expect(unableToVerifyReasonLabel("non_scorable")).toMatch(
      /review|exception/i,
    );
  });

  it("throws on an unhandled reason", () => {
    expect(() => unableToVerifyReasonLabel("bogus" as never)).toThrow(
      /Unhandled unable-to-verify reason/,
    );
  });
});
