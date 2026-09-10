import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type {
  EvidenceRecord,
  Finding,
} from "@complyloop/analysis-core/contract/entities";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import {
  EVIDENCE_KIND_FILTER_ORDER,
  evidenceKindHref,
  evidenceRecordHref,
  filterFindings,
  findingDetailHref,
  findingListPaginationQuery,
  findingQueuePosition,
  findingsListHref,
  hasActiveFindingFilters,
  orderedFindingIdsForQueue,
  pageSliceFromQuery,
  paginateSlice,
  parseEvidenceDateParam,
  parseEvidenceKindParam,
  parseEvidenceQueryParam,
  parseFindingListParams,
  parsePageParam,
  parsePresetIdParam,
  parseReportViewParam,
  parseRequirementStatusParam,
  reportHref,
  requirementsPageHref,
  requirementsStatusHref,
} from "./filter-params";
import {
  entityIdSchema,
  findingIdsField,
  firstIssueMessage,
  formRecord,
  githubRepoSearchResponseSchema,
  optionalNoteSchema,
  parseForm,
  parseInput,
  parseUnknown,
  requiredField,
} from "./filters";

describe("EVIDENCE_KIND_FILTER_ORDER", () => {
  it("lists consolidated kinds for the evidence page chips", () => {
    expect(EVIDENCE_KIND_FILTER_ORDER).toContain("finding");
    expect(EVIDENCE_KIND_FILTER_ORDER).toContain("assessment_job");
  });

  it("keeps the chip allow-list short (no noun-pair kinds)", () => {
    for (const kind of EVIDENCE_KIND_FILTER_ORDER) {
      expect(kind).not.toMatch(/_set$|_cleared$|human_pass/);
    }
  });
});

describe("parseEvidenceKindParam", () => {
  it("parses a valid kind", () => {
    expect(parseEvidenceKindParam("finding")).toBe("finding");
  });

  it("returns undefined for missing or invalid values", () => {
    expect(parseEvidenceKindParam(undefined)).toBeUndefined();
    expect(parseEvidenceKindParam([])).toBeUndefined();
    expect(parseEvidenceKindParam("")).toBeUndefined();
    expect(parseEvidenceKindParam("bogus_kind")).toBeUndefined();
    expect(parseEvidenceKindParam(["unknown"])).toBeUndefined();
  });
});

describe("evidenceKindHref", () => {
  it("builds filter links", () => {
    expect(evidenceKindHref("finding")).toBe("/evidence?kind=finding");
    expect(evidenceKindHref("finding", 2)).toBe(
      "/evidence?kind=finding&page=2",
    );
    expect(evidenceKindHref("finding", 1)).toBe("/evidence?kind=finding");
  });

  it("preserves text/date/author filters when switching kinds", () => {
    expect(
      evidenceKindHref("finding", undefined, {
        q: "alt",
        from: "2026-09-01",
        to: "2026-09-10",
        actor: "octocat",
      }),
    ).toBe(
      "/evidence?kind=finding&q=alt&from=2026-09-01&to=2026-09-10&actor=octocat",
    );
    expect(evidenceKindHref(undefined, undefined, { q: "alt" })).toBe(
      "/evidence?q=alt",
    );
  });
});

describe("parseEvidenceQueryParam", () => {
  it("trims and caps the query", () => {
    expect(parseEvidenceQueryParam("  alt text  ")).toBe("alt text");
    expect(parseEvidenceQueryParam("x".repeat(200))).toHaveLength(100);
  });

  it("returns undefined for missing or blank values", () => {
    expect(parseEvidenceQueryParam(undefined)).toBeUndefined();
    expect(parseEvidenceQueryParam("   ")).toBeUndefined();
    expect(parseEvidenceQueryParam(["alt", "other"])).toBe("alt");
  });
});

describe("parseEvidenceDateParam", () => {
  it("accepts valid calendar dates", () => {
    expect(parseEvidenceDateParam("2026-09-10")).toBe("2026-09-10");
  });

  it("rejects malformed or impossible dates", () => {
    expect(parseEvidenceDateParam(undefined)).toBeUndefined();
    expect(parseEvidenceDateParam("09/10/2026")).toBeUndefined();
    expect(parseEvidenceDateParam("2026-13-01")).toBeUndefined();
    expect(parseEvidenceDateParam("2026-02-30")).toBeUndefined();
    expect(parseEvidenceDateParam(["2026-09-10", "2026-09-11"])).toBe(
      "2026-09-10",
    );
  });
});

describe("parseReportViewParam", () => {
  it("accepts the engineering view", () => {
    expect(parseReportViewParam("engineering")).toBe("engineering");
  });

  it("defaults everything else to audit", () => {
    expect(parseReportViewParam(undefined)).toBe("audit");
    expect(parseReportViewParam(null)).toBe("audit");
    expect(parseReportViewParam("audit")).toBe("audit");
    expect(parseReportViewParam("bogus")).toBe("audit");
  });
});

describe("report href builders", () => {
  it("builds markdown and html hrefs for each view", () => {
    expect(reportHref("audit", "markdown")).toBe("/evidence/report?view=audit");
    expect(reportHref("engineering", "markdown")).toBe(
      "/evidence/report?view=engineering",
    );
    expect(reportHref("audit", "html")).toBe(
      "/evidence/report/html?view=audit",
    );
    expect(reportHref("engineering", "html")).toBe(
      "/evidence/report/html?view=engineering",
    );
  });
});

describe("parseRequirementStatusParam", () => {
  it("returns a known requirement status", () => {
    expect(parseRequirementStatusParam("failed")).toBe("failed");
    expect(parseRequirementStatusParam("unable_to_verify")).toBe(
      "unable_to_verify",
    );
  });

  it("returns undefined for missing or unknown values", () => {
    expect(parseRequirementStatusParam(undefined)).toBeUndefined();
    expect(parseRequirementStatusParam("")).toBeUndefined();
    expect(parseRequirementStatusParam("bogus")).toBeUndefined();
  });

  it("accepts the first value when Next passes an array", () => {
    expect(parseRequirementStatusParam(["passed", "failed"])).toBe("passed");
  });
});

describe("requirementsStatusHref", () => {
  it("builds a deep link for a status filter", () => {
    expect(requirementsStatusHref("failed")).toBe(
      "/requirements?status=failed",
    );
  });

  it("returns the unfiltered list path when clearing", () => {
    expect(requirementsStatusHref()).toBe("/requirements");
    expect(requirementsStatusHref(undefined)).toBe("/requirements");
  });
});

const isValidPresetId = (id: string) =>
  ["preset-rgaa-full", "preset-wcag-aa", "preset-wcag-full"].includes(id);

describe("requirements page preset URL", () => {
  it("parses only known preset ids", () => {
    expect(parsePresetIdParam("preset-wcag-aa", isValidPresetId)).toBe(
      "preset-wcag-aa",
    );
    expect(parsePresetIdParam("nope", isValidPresetId)).toBeUndefined();
    expect(parsePresetIdParam(undefined, isValidPresetId)).toBeUndefined();
    expect(parsePresetIdParam("", isValidPresetId)).toBeUndefined();
  });

  it("accepts the first element of a searchParams array", () => {
    expect(
      parsePresetIdParam(["preset-wcag-aa", "junk"], isValidPresetId),
    ).toBe("preset-wcag-aa");
    expect(parsePresetIdParam([], isValidPresetId)).toBeUndefined();
  });

  it("omits presetId from the URL when it matches the project default", () => {
    expect(
      requirementsPageHref({
        presetId: "preset-rgaa-full",
        defaultPresetId: "preset-rgaa-full",
      }),
    ).toBe("/requirements");
    expect(
      requirementsPageHref({
        presetId: "preset-wcag-aa",
        defaultPresetId: "preset-rgaa-full",
      }),
    ).toBe("/requirements?presetId=preset-wcag-aa");
  });

  it("keeps presetId and status together for shareable links", () => {
    expect(
      requirementsPageHref({
        presetId: "preset-wcag-aa",
        status: "failed",
        defaultPresetId: "preset-rgaa-full",
      }),
    ).toBe("/requirements?presetId=preset-wcag-aa&status=failed");
  });

  it("emits a status-only link when there is no preset override", () => {
    expect(
      requirementsPageHref({
        status: "needs_review",
        defaultPresetId: "preset-rgaa-full",
      }),
    ).toBe("/requirements?status=needs_review");
  });
});

const base: EvidenceRecord = {
  id: "e1",
  at: "2026-01-02T00:00:00.000Z",
  kind: "assessment_completed",
  summary: "Assessment finished",
};

describe("evidenceRecordHref", () => {
  it("links a finding event to its finding page", () => {
    expect(evidenceRecordHref({ ...base, findingId: "f42" }, [])).toBe(
      "/findings/f42",
    );
  });

  it("links a control event to the requirements filter matching that control's status", () => {
    const requirements = [
      {
        id: "r1",
        projectId: "p1",
        controlId: "ctl-button-name",
        status: "needs_review" as const,
        determination: "automated" as const,
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ];
    expect(
      evidenceRecordHref(
        { ...base, controlId: "ctl-button-name" },
        requirements,
      ),
    ).toBe("/requirements?status=needs_review#requirement-ctl-button-name");
  });

  it("falls back to the requirements page when the control is not in scope", () => {
    const requirements = [
      {
        id: "r1",
        projectId: "p1",
        controlId: "ctl-button-name",
        status: "passed" as const,
        determination: "automated" as const,
        updatedAt: "",
      },
    ];
    expect(
      evidenceRecordHref({ ...base, controlId: "ctl-missing" }, requirements),
    ).toBe("/requirements#requirement-ctl-missing");
  });

  it("links an assessment event to the project home", () => {
    expect(evidenceRecordHref({ ...base, assessmentId: "a1" }, [])).toBe(
      "/dashboard",
    );
  });

  it("returns undefined for records with no navigation target", () => {
    expect(evidenceRecordHref({ ...base }, [])).toBeUndefined();
  });
});

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

function finding(id: string, overrides: Partial<Finding> = {}): Finding {
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
    analyzerId: "jsx-a11y",
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
    expect(
      parseFindingListParams({ severity: "bogus", tab: "nope" }).severity,
    ).toBeUndefined();
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
    expect(findingsListHref({ tab: "by_cause", page: 3, cluster: "c1" })).toBe(
      "/findings?cluster=c1&tab=by_cause&page=3",
    );
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
      analyzerId: "axe",
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
      filterFindings(
        findings,
        { q: "1.1" },
        { controls, remediationStatusFor },
      ),
    ).toHaveLength(1);
    expect(
      filterFindings(
        findings,
        { q: "alt text" },
        { controls, remediationStatusFor },
      ),
    ).toHaveLength(1);
    expect(
      filterFindings(
        findings,
        { q: "missing alt" },
        { controls, remediationStatusFor },
      ),
    ).toHaveLength(1);
    expect(
      filterFindings(
        findings,
        { q: "Button.tsx" },
        { controls, remediationStatusFor },
      ),
    ).toHaveLength(1);
    expect(
      filterFindings(
        findings,
        { q: "preview.example" },
        { controls, remediationStatusFor },
      ),
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

describe("parsePageParam", () => {
  it("defaults invalid values to page 1", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
  });

  it("parses positive integers", () => {
    expect(parsePageParam("3")).toBe(3);
    expect(parsePageParam(["2"])).toBe(2);
  });
});

describe("paginateSlice", () => {
  it("returns a bounded page and navigation flags", () => {
    const items = Array.from({ length: 60 }, (_, i) => i + 1);
    const page = paginateSlice(items, 2, 25);
    expect(page.items).toHaveLength(25);
    expect(page.items[0]).toBe(26);
    expect(page.total).toBe(60);
    expect(page.totalPages).toBe(3);
    expect(page.hasPrev).toBe(true);
    expect(page.hasNext).toBe(true);
  });

  it("clamps past the last page", () => {
    const page = paginateSlice([1, 2, 3], 99, 25);
    expect(page.page).toBe(1);
    expect(page.items).toEqual([1, 2, 3]);
    expect(page.hasNext).toBe(false);
  });
});

describe("pageSliceFromQuery", () => {
  it("wraps a SQL page with total-based navigation", () => {
    const page = pageSliceFromQuery(["a", "b"], 2, 60, 25);
    expect(page.items).toEqual(["a", "b"]);
    expect(page.page).toBe(2);
    expect(page.total).toBe(60);
    expect(page.totalPages).toBe(3);
    expect(page.hasPrev).toBe(true);
    expect(page.hasNext).toBe(true);
  });
});

describe("formRecord", () => {
  it("maps single fields to strings and repeated fields to arrays", () => {
    const form = new FormData();
    form.set("orgId", "org-1");
    form.append("findingIds", "f1");
    form.append("findingIds", "f2");
    expect(formRecord(form)).toEqual({
      orgId: "org-1",
      findingIds: ["f1", "f2"],
    });
  });
});

describe("parseUnknown", () => {
  it("returns parsed data when the payload matches", () => {
    expect(parseUnknown(entityIdSchema, "  org-1  ", "Invalid id.")).toBe(
      "org-1",
    );
  });

  it("throws the fallback message when the payload does not match", () => {
    expect(() => parseUnknown(entityIdSchema, "", "Invalid id.")).toThrow(
      "Invalid id.",
    );
  });
});

describe("firstIssueMessage", () => {
  it("uses the first Zod issue message", () => {
    const result = z
      .object({
        orgId: z
          .string({ error: "An organization id is required." })
          .trim()
          .min(1, { error: "An organization id is required." }),
      })
      .safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(firstIssueMessage(result.error, "Invalid form input.")).toBe(
      "An organization id is required.",
    );
  });
});

describe("parseForm", () => {
  it("parses matching form fields", () => {
    const form = new FormData();
    form.set("orgId", " org-1 ");
    expect(parseForm(z.object({ orgId: entityIdSchema }), form)).toEqual({
      orgId: "org-1",
    });
  });

  it("throws PublicError with the first issue message", () => {
    const form = new FormData();
    const schema = z.object({
      orgId: z
        .string({ error: "An organization id is required." })
        .trim()
        .min(1, { error: "An organization id is required." }),
    });
    expect(() => parseForm(schema, form)).toThrow(PublicError);
    expect(() => parseForm(schema, form)).toThrow(
      "An organization id is required.",
    );
  });
});

describe("parseInput", () => {
  it("parses a bound action argument", () => {
    expect(parseInput(entityIdSchema, "f1")).toBe("f1");
  });

  it("rejects an empty bound id", () => {
    expect(() => parseInput(entityIdSchema, "  ")).toThrow(PublicError);
  });
});

describe("note and finding-id field schemas", () => {
  it("trims optional notes and rejects notes over 2000 characters", () => {
    expect(optionalNoteSchema.parse("  hello  ")).toBe("hello");
    expect(optionalNoteSchema.parse("")).toBeUndefined();
    expect(optionalNoteSchema.parse(undefined)).toBeUndefined();
    expect(optionalNoteSchema.safeParse("x".repeat(2001)).success).toBe(false);
  });

  it("requires a non-empty field via requiredField", () => {
    const note = requiredField("Note required.", 2000);
    expect(note.parse("  note  ")).toBe("note");
    expect(note.safeParse("  ").success).toBe(false);
  });

  it("normalizes one or many finding ids and rejects an empty list", () => {
    const findingIds = findingIdsField("Select at least one finding.");
    expect(findingIds.parse("f1")).toEqual(["f1"]);
    expect(findingIds.parse([" f1 ", "f1", "f2"])).toEqual(["f1", "f2"]);
    expect(findingIds.safeParse([]).success).toBe(false);
  });
});

describe("githubRepoSearchResponseSchema", () => {
  it("accepts a search page and rejects a forged payload", () => {
    const ok = {
      repos: [
        {
          fullName: "acme/app",
          name: "app",
          description: null,
          private: false,
          defaultBranch: "main",
          updatedAt: "2026-01-01T00:00:00.000Z",
          htmlUrl: "https://github.com/acme/app",
          cloneUrl: "https://github.com/acme/app.git",
        },
      ],
      page: 1,
      hasMore: false,
    };
    expect(githubRepoSearchResponseSchema.parse(ok).repos[0]?.fullName).toBe(
      "acme/app",
    );
    expect(
      githubRepoSearchResponseSchema.safeParse({ error: "nope" }).success,
    ).toBe(false);
  });
});
