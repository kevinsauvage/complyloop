import { describe, expect, it } from "vitest";
import type { Finding } from "@complyloop/analysis-core/contract/finding-types";
import type { Control } from "@complyloop/domain/project-types";
import {
  filterFindings,
  findingDetailHref,
  findingListPaginationQuery,
  findingQueuePosition,
  findingsListHref,
  hasActiveFindingFilters,
  orderedFindingIdsForQueue,
  parseFindingListParams,
} from "./finding-list-filter";

const controls: Control[] = [
  {
    id: "ctl-img",
    frameworkId: "fw",
    code: "1.1",
    secondaryCode: "RGAA-1.1",
    title: "Images have alt text",
    description: "d",
    checkId: "img-alt",
  },
  {
    id: "ctl-btn",
    frameworkId: "fw",
    code: "7.3",
    secondaryCode: "RGAA-7.3",
    title: "Target size",
    description: "d",
    checkId: "target-size",
  },
];

function finding(
  id: string,
  overrides: Partial<Finding> = {},
): Finding {
  return {
    id,
    projectId: "p1",
    controlId: "ctl-img",
    assessmentId: "a1",
    checkId: "img-alt",
    status: "open",
    kind: "violation",
    severity: "serious",
    confidence: "high",
    reason: "Missing alt attribute",
    location: {
      kind: "source",
      filePath: "src/components/Button.tsx",
      line: 12,
      column: 4,
      snippet: "<img />",
      span: { start: 0, end: 1 },
    },
    engine: "ast",
    fix: null,
    explanations: [],
    detectedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseFindingListParams", () => {
  it("parses filter and tab params", () => {
    expect(
      parseFindingListParams({
        q: "Button",
        severity: "serious",
        engine: "runtime",
        remediation: "suggested",
        control: "ctl-img",
        cluster: "img-alt:file:Button.tsx",
        tab: "resolved",
        page: "2",
      }),
    ).toEqual({
      q: "Button",
      severity: "serious",
      engine: "runtime",
      remediation: "suggested",
      control: "ctl-img",
      cluster: "img-alt:file:Button.tsx",
      tab: "resolved",
      page: 2,
    });
  });

  it("defaults tab to open and page to 1", () => {
    expect(parseFindingListParams({})).toEqual({
      q: undefined,
      severity: undefined,
      engine: undefined,
      remediation: undefined,
      control: undefined,
      cluster: undefined,
      tab: "open",
      page: 1,
    });
  });

  it("ignores unknown enum values", () => {
    expect(parseFindingListParams({ severity: "bogus", tab: "nope" }).severity)
      .toBeUndefined();
    expect(parseFindingListParams({ tab: "nope" }).tab).toBe("open");
  });

  it("accepts the first value when Next passes an array", () => {
    expect(parseFindingListParams({ q: ["Button", "Form"] }).q).toBe("Button");
  });
});

describe("findingsListHref", () => {
  it("builds a deep link with filters", () => {
    const href = findingsListHref({
      control: "ctl-img",
      q: "Button",
      tab: "open",
    });
    expect(href).toContain("control=ctl-img");
    expect(href).toContain("q=Button");
    expect(href.startsWith("/findings?")).toBe(true);
  });

  it("includes non-default tab and page", () => {
    expect(
      findingsListHref({ tab: "by_cause", page: 3, cluster: "c1" }),
    ).toBe("/findings?cluster=c1&tab=by_cause&page=3");
  });

  it("returns the unfiltered list path when clearing", () => {
    expect(findingsListHref()).toBe("/findings");
    expect(findingsListHref({ tab: "open", page: 1 })).toBe("/findings");
  });

  it("preserves tab and page in detail hrefs", () => {
    const params = parseFindingListParams({ tab: "resolved", page: "3" });
    expect(findingsListHref(params)).toBe("/findings?tab=resolved&page=3");
    expect(findingDetailHref("f1", params)).toBe(
      "/findings/f1?tab=resolved&page=3",
    );
  });
});

describe("findingListPaginationQuery", () => {
  it("preserves active filters without page", () => {
    expect(
      findingListPaginationQuery({
        q: "Button",
        severity: "serious",
        tab: "resolved",
        page: 2,
      }),
    ).toEqual({
      q: "Button",
      severity: "serious",
      tab: "resolved",
    });
  });
});

describe("hasActiveFindingFilters", () => {
  it("is false when no filters are set", () => {
    expect(hasActiveFindingFilters({})).toBe(false);
  });

  it("is true when any filter is set", () => {
    expect(hasActiveFindingFilters({ q: "x" })).toBe(true);
    expect(hasActiveFindingFilters({ cluster: "c1" })).toBe(true);
  });
});

describe("filterFindings", () => {
  const findings = [
    finding("f1"),
    finding("f2", {
      controlId: "ctl-btn",
      checkId: "target-size",
      reason: "Target too small",
      severity: "moderate",
      engine: "runtime",
      location: {
        kind: "dom",
        url: "https://preview.example.com/",
        selector: "button.submit",
        snippet: "<button />",
      },
    }),
  ];

  const remediationStatusFor = (findingId: string) =>
    findingId === "f1" ? "suggested" : "detected";

  it("matches text search on control code, title, reason, and path", () => {
    expect(
      filterFindings(findings, { q: "1.1" }, { controls, remediationStatusFor }),
    ).toHaveLength(1);
    expect(
      filterFindings(findings, { q: "alt text" }, { controls, remediationStatusFor }),
    ).toHaveLength(1);
    expect(
      filterFindings(findings, { q: "missing alt" }, { controls, remediationStatusFor }),
    ).toHaveLength(1);
    expect(
      filterFindings(findings, { q: "Button.tsx" }, { controls, remediationStatusFor }),
    ).toHaveLength(1);
    expect(
      filterFindings(findings, { q: "preview.example" }, { controls, remediationStatusFor }),
    ).toHaveLength(1);
  });

  it("filters by severity, engine, remediation, and control", () => {
    expect(
      filterFindings(
        findings,
        { severity: "moderate" },
        { controls, remediationStatusFor },
      ),
    ).toEqual([findings[1]]);
    expect(
      filterFindings(
        findings,
        { engine: "runtime" },
        { controls, remediationStatusFor },
      ),
    ).toEqual([findings[1]]);
    expect(
      filterFindings(
        findings,
        { remediation: "suggested" },
        { controls, remediationStatusFor },
      ),
    ).toEqual([findings[0]]);
    expect(
      filterFindings(
        findings,
        { control: "ctl-btn" },
        { controls, remediationStatusFor },
      ),
    ).toEqual([findings[1]]);
  });

  it("filters by cluster membership", () => {
    const clusterFindingIds = new Set(["f1"]);
    expect(
      filterFindings(
        findings,
        { cluster: "img-alt:file:Button.tsx" },
        { controls, remediationStatusFor, clusterFindingIds },
      ),
    ).toEqual([findings[0]]);
  });
});

describe("finding queue ordering", () => {
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
