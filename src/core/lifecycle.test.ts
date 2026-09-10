import { describe, expect, it } from "vitest";
import type {
  Assessment,
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import type { RemediationSuggestion } from "@complyloop/analysis-core/contract/finding-types";
import { REQUIREMENT_STATUSES } from "@complyloop/analysis-core/contract/statuses";
import {
  advanceRemediation,
  canBulkApproveRemediation,
  clusterFindings,
  countByStatus,
  findingAct,
  type FindingActInput,
  formatDateTime,
  formatDateTimeWithZone,
  hasSafeDeterministicFix,
  latestAssessmentFor,
  prioritizeClusters,
  prioritizeFindings,
  refreshSuggestion,
  runtimeCoverageSummary,
  toCountMap,
  unableToVerifyReason,
  unableToVerifyReasonLabel,
} from "./lifecycle";
import { assessmentJobsResponseSchema } from "./assessment-jobs";

describe("assessmentJobsResponseSchema", () => {
  it("accepts a job list and rejects a missing jobs array", () => {
    const ok = {
      jobs: [
        {
          id: "job-1",
          projectId: "p1",
          status: "queued",
          trigger: "manual",
          payload: {},
          attempts: 0,
          maxAttempts: 3,
          availableAt: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    expect(assessmentJobsResponseSchema.parse(ok).jobs).toHaveLength(1);
    expect(assessmentJobsResponseSchema.safeParse({ jobs: null }).success).toBe(
      false,
    );
  });
});

function assessment(
  partial: Pick<Assessment, "id" | "projectId" | "completedAt"> &
    Partial<Assessment>,
): Assessment {
  return {
    startedAt: partial.startedAt ?? partial.completedAt,
    filesScanned: 0,
    summary: {
      passed: 0,
      failed: 0,
      needs_review: 0,
      not_applicable: 0,
      unable_to_verify: 0,
    },
    ...partial,
  };
}

describe("latestAssessmentFor", () => {
  it("picks the newest completedAt regardless of array order", () => {
    const older = assessment({
      id: "a1",
      projectId: "p1",
      completedAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = assessment({
      id: "a2",
      projectId: "p1",
      completedAt: "2026-06-01T00:00:00.000Z",
    });
    expect(latestAssessmentFor([newer, older], "p1")?.id).toBe("a2");
    expect(latestAssessmentFor([older, newer], "p1")?.id).toBe("a2");
  });

  it("ignores other projects", () => {
    expect(
      latestAssessmentFor(
        [
          assessment({
            id: "other",
            projectId: "p2",
            completedAt: "2026-09-01T00:00:00.000Z",
          }),
          assessment({
            id: "mine",
            projectId: "p1",
            completedAt: "2026-01-01T00:00:00.000Z",
          }),
        ],
        "p1",
      )?.id,
    ).toBe("mine");
  });
});

describe("runtimeCoverageSummary", () => {
  it("returns source only when no preview URL is configured", () => {
    expect(runtimeCoverageSummary({ runtimeBaseUrl: undefined })).toEqual({
      mode: "source_only",
      label: "Source only",
      pagesScanned: null,
      runtimeError: null,
    });
  });

  it("returns source + preview with page count when runtime ran", () => {
    expect(
      runtimeCoverageSummary(
        { runtimeBaseUrl: "https://app.example.com" },
        { ast: true, runtime: true, runtimePagesScanned: 3 },
      ),
    ).toEqual({
      mode: "source_and_preview",
      label: "Source + preview (3 pages)",
      pagesScanned: 3,
      runtimeError: null,
    });
  });

  it("surfaces last runtime error from assessment engines", () => {
    expect(
      runtimeCoverageSummary(
        { runtimeBaseUrl: "https://app.example.com" },
        { ast: true, runtime: false, runtimeError: "Connection refused" },
      ).runtimeError,
    ).toBe("Connection refused");
  });
});

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

describe("formatDateTime", () => {
  it("formats ISO timestamps with en-GB locale", () => {
    const formatted = formatDateTime("2024-06-15T14:30:00.000Z");
    expect(formatted).toMatch(/15/);
    expect(formatted).toMatch(/2024/);
  });
});

describe("formatDateTimeWithZone", () => {
  it("includes a zone qualifier so the instant is unambiguous", () => {
    const formatted = formatDateTimeWithZone("2024-06-15T14:30:00.000Z");
    expect(formatted).toMatch(/2024/);
    expect(formatted).toMatch(/GMT|UTC|[+-]\d{2}:?\d{2}|CET|CEST|BST/i);
  });
});

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

function remediation(status: Remediation["status"]): Remediation {
  return {
    id: "r1",
    findingId: "f1",
    status,
    suggestion: null,
    history: [{ status: "detected", at: "2026-01-01T00:00:00.000Z" }],
  };
}

const suggestion: RemediationSuggestion = {
  description: "Add an alt attribute",
  proposedSnippet: '<img alt="…" />',
  provenance: "ai",
  confidence: "medium",
  model: "test-model",
};

describe("advanceRemediation", () => {
  it("follows the remediation lifecycle in order", () => {
    expect(
      advanceRemediation(remediation("detected"), "suggested").status,
    ).toBe("suggested");
    expect(
      advanceRemediation(remediation("suggested"), "approved").status,
    ).toBe("approved");
    expect(
      advanceRemediation(remediation("approved"), "implemented").status,
    ).toBe("implemented");
    expect(
      advanceRemediation(remediation("implemented"), "verified").status,
    ).toBe("verified");
  });

  it("appends a history entry on a valid transition", () => {
    const advanced = advanceRemediation(
      remediation("suggested"),
      "approved",
      "ok",
    );
    expect(advanced.status).toBe("approved");
    expect(advanced.history).toHaveLength(2);
    expect(advanced.history[1]).toMatchObject({
      status: "approved",
      note: "ok",
    });
  });

  it("rejects skipping stages or moving backwards", () => {
    expect(() =>
      advanceRemediation(remediation("detected"), "verified"),
    ).toThrow(/Invalid remediation transition/);
    expect(() =>
      advanceRemediation(remediation("suggested"), "implemented"),
    ).toThrow(/Invalid remediation transition/);
    expect(() =>
      advanceRemediation(remediation("approved"), "suggested"),
    ).toThrow(/Invalid remediation transition/);
    expect(() =>
      advanceRemediation(remediation("verified"), "detected"),
    ).toThrow(/Invalid remediation transition/);
  });
});

describe("refreshSuggestion", () => {
  it("advances detected → suggested with the new suggestion", () => {
    const updated = refreshSuggestion(
      remediation("detected"),
      suggestion,
      "Patch ready: Add an alt attribute",
    );
    expect(updated.status).toBe("suggested");
    expect(updated.suggestion).toEqual(suggestion);
    expect(updated.history.at(-1)).toMatchObject({
      status: "suggested",
      note: "Patch ready: Add an alt attribute",
    });
  });

  it("keeps suggested status and appends history when refreshing", () => {
    const base = {
      ...remediation("suggested"),
      suggestion: {
        description: "old",
        proposedSnippet: "old",
        provenance: "deterministic" as const,
      },
    };
    const updated = refreshSuggestion(
      base,
      suggestion,
      "AI suggestion refreshed: Add an alt attribute",
    );
    expect(updated.status).toBe("suggested");
    expect(updated.suggestion).toEqual(suggestion);
    expect(updated.history).toHaveLength(2);
    expect(updated.history[1]).toMatchObject({
      status: "suggested",
      note: "AI suggestion refreshed: Add an alt attribute",
    });
  });

  it("rejects refresh after approval", () => {
    expect(() =>
      refreshSuggestion(remediation("approved"), suggestion, "too late"),
    ).toThrow(/before approval/);
    expect(() =>
      refreshSuggestion(remediation("implemented"), suggestion, "too late"),
    ).toThrow(/before approval/);
    expect(() =>
      refreshSuggestion(remediation("verified"), suggestion, "too late"),
    ).toThrow(/before approval/);
  });
});

const sourceFinding: Finding = {
  id: "f1",
  projectId: "p1",
  controlId: "c1",
  assessmentId: "a1",
  checkId: "img-alt",
  status: "open",
  kind: "violation",
  severity: "serious",
  reason: "missing alt",
  confidence: "high",
  location: {
    kind: "source",
    filePath: "a.tsx",
    line: 1,
    column: 1,
    span: { start: 0, end: 1 },
    snippet: "<img />",
  },
  fix: null,
  explanations: [],
  detectedAt: "2026-01-01T00:00:00.000Z",
};

const domFinding: Finding = {
  ...sourceFinding,
  location: {
    kind: "dom",
    url: "https://example.com/login",
    selector: "input#email",
    snippet: "<input id='email'>",
  },
};

function rem(
  status: Remediation["status"],
  suggestion: Remediation["suggestion"] = null,
): Remediation {
  return { id: "r1", findingId: "f1", status, suggestion, history: [] };
}

function act(overrides: Partial<FindingActInput> = {}) {
  return findingAct({
    finding: sourceFinding,
    remediation: rem("detected"),
    canRemediate: true,
    prUrl: null,
    aiAvailable: true,
    patchReady: false,
    githubConnected: true,
    ...overrides,
  });
}

describe("hasSafeDeterministicFix", () => {
  it("is true for a non-editable proposed fix", () => {
    expect(
      hasSafeDeterministicFix({
        ...sourceFinding,
        fix: {
          kind: "remove_attribute",
          attribute: "role",
          span: { start: 0, end: 1 },
        },
      }),
    ).toBe(true);
  });

  it("is false when a human must edit the inserted value", () => {
    expect(
      hasSafeDeterministicFix({
        ...sourceFinding,
        fix: {
          kind: "insert_attribute",
          attribute: "alt",
          value: "",
          editable: true,
          span: { start: 0, end: 1 },
        },
      }),
    ).toBe(false);
  });

  it("is false when there is no proposed fix", () => {
    expect(hasSafeDeterministicFix(sourceFinding)).toBe(false);
  });
});

describe("findingAct", () => {
  it("offers Generate patch for an open source Finding with no patch", () => {
    const view = act();
    expect(view.beat).toBe("source_generate");
    if (view.beat !== "source_generate") return;
    expect(view.title).toBe("Fix this finding");
    expect(view.generateLabel).toBe("Generate patch");
    expect(view.canGenerate).toBe(true);
    expect(view.showDismiss).toBe(true);
  });

  it("labels deterministic source generation as Verify and prepare patch", () => {
    const view = act({
      finding: {
        ...sourceFinding,
        fix: {
          kind: "remove_attribute",
          attribute: "role",
          span: { start: 0, end: 1 },
        },
      },
      aiAvailable: false,
    });
    expect(view.beat).toBe("source_generate");
    if (view.beat !== "source_generate") return;
    expect(view.generateLabel).toBe("Verify and prepare patch");
    expect(view.canGenerate).toBe(true);
  });

  it("shows the patch and Create draft PR when a verified patch is ready", () => {
    const view = act({
      patchReady: true,
      remediation: rem("suggested", {
        description: "Add alt",
        proposedSnippet: '<img alt="Hero" />',
        provenance: "ai",
      }),
    });
    expect(view.beat).toBe("source_review");
    if (view.beat !== "source_review") return;
    expect(view.title).toBe("Review patch");
    expect(view.showCreatePr).toBe(true);
    expect(view.showReplacePatch).toBe(true);
    expect(view.showHandoff).toBe(true);
  });

  it("treats an open source Finding with a PR as in review on GitHub", () => {
    const view = act({
      patchReady: true,
      prUrl: "https://github.com/acme/shop/pull/65",
      remediation: rem("approved"),
    });
    expect(view.beat).toBe("source_in_review");
    if (view.beat !== "source_in_review") return;
    expect(view.title).toBe("In review on GitHub");
    expect(view.prUrl).toBe("https://github.com/acme/shop/pull/65");
    expect(view.showHandoff).toBe(false);
    expect(view.showDismiss).toBe(true);
  });

  it("does not offer generate or handoff once the Finding is verified", () => {
    const view = act({
      finding: {
        ...sourceFinding,
        status: "resolved",
        resolvedNote: "Fix verified by re-running the automated check.",
      },
      remediation: rem("verified"),
      prUrl: "https://github.com/acme/shop/pull/65",
      patchReady: true,
    });
    expect(view.beat).toBe("verified");
    expect(view.showDismiss).toBe(false);
    expect(view.showHandoff).toBe(false);
  });

  it("does not offer generate or dismiss for a dismissed Finding", () => {
    const view = act({
      finding: {
        ...sourceFinding,
        status: "dismissed",
        dismissal: {
          reason: "false_positive",
          note: "decorative",
          at: "2026-01-01T00:00:00.000Z",
        },
      },
    });
    expect(view.beat).toBe("dismissed");
    expect(view.showDismiss).toBe(false);
  });

  it("offers Approve for a runtime Finding with a suggestion", () => {
    const view = act({
      finding: domFinding,
      remediation: rem("suggested", {
        description: "Associate a label",
        proposedSnippet: "<label>Email</label>",
        provenance: "ai",
      }),
    });
    expect(view.beat).toBe("runtime_approve");
    expect(view.title).toBe("Review guidance");
    expect(view.showHandoff).toBe(true);
  });

  it("offers Verify for an implemented site-level Finding", () => {
    const view = act({
      finding: {
        ...sourceFinding,
        location: {
          kind: "site",
          pages: ["/", "/about"],
          detail: "Nav labels differ",
        },
      },
      remediation: rem("implemented"),
    });
    expect(view.beat).toBe("runtime_verify");
  });

  it("offers Verify for an implemented runtime Finding", () => {
    const view = act({
      finding: domFinding,
      remediation: rem("implemented"),
    });
    expect(view.beat).toBe("runtime_verify");
    expect(view.title).toBe("Confirm the page is fixed");
  });

  it("offers Implement for an approved runtime Finding", () => {
    const view = act({
      finding: domFinding,
      remediation: rem("approved"),
    });
    expect(view.beat).toBe("runtime_implement");
    expect(view.title).toBe("Implemented outside ComplyLoop");
  });

  it("shows Verified beat for a verified runtime Finding", () => {
    const view = act({
      finding: domFinding,
      remediation: rem("verified"),
    });
    expect(view.beat).toBe("verified");
    expect(view.title).toBe("Verified");
  });

  it("shows view_only for users who cannot remediate", () => {
    const view = act({ canRemediate: false });
    expect(view.beat).toBe("view_only");
    expect(view.title).toBe("Fix this finding");
    expect(view.description).toMatch(/view-only access/);
  });

  it("explains that GitHub must be connected before generating a patch", () => {
    const view = act({
      githubConnected: false,
      aiAvailable: true,
      canRemediate: true,
    });
    expect(view.beat).toBe("source_generate");
    if (view.beat !== "source_generate") return;
    expect(view.description).toMatch(/Connect a GitHub repository/);
  });

  it("explains that AI generation is disabled", () => {
    const view = act({
      aiAvailable: false,
      githubConnected: true,
    });
    expect(view.beat).toBe("source_generate");
    if (view.beat !== "source_generate") return;
    expect(view.description).toMatch(/isn't enabled/);
  });

  it("never treats a runtime Finding as a patch/PR beat", () => {
    const view = act({
      finding: domFinding,
      patchReady: true,
      prUrl: "https://github.com/acme/shop/pull/1",
      githubConnected: true,
    });
    expect(view.beat).toBe("runtime_generate");
  });

  it("throws on an unrecognized remediation status", () => {
    expect(() =>
      act({ finding: domFinding, remediation: rem("bogus" as never) }),
    ).toThrow(/Unhandled remediation status/);
  });
});

describe("canBulkApproveRemediation", () => {
  it("allows bulk approve for open runtime findings with a suggestion", () => {
    expect(canBulkApproveRemediation(domFinding, "suggested")).toBe(true);
  });

  it("does not bulk approve source findings even when suggested", () => {
    expect(canBulkApproveRemediation(sourceFinding, "suggested")).toBe(false);
  });

  it("does not bulk approve resolved or non-suggested runtime findings", () => {
    expect(
      canBulkApproveRemediation(
        { ...domFinding, status: "resolved" },
        "suggested",
      ),
    ).toBe(false);
    expect(canBulkApproveRemediation(domFinding, "approved")).toBe(false);
  });
});
