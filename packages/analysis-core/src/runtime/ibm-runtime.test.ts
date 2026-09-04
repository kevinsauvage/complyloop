import { describe, expect, it, vi } from "vitest";
import * as checkAuthority from "../check-authority";
import { ibmFindingsForPage, ibmFindingsFromReport } from "./ibm-runtime";
import type { RuntimeScanPageResult } from "./findings";

const setConfigMock = vi.fn();
const getComplianceMock = vi.fn();

vi.mock("accessibility-checker", () => ({
  setConfig: (...args: unknown[]) => setConfigMock(...args),
  getCompliance: (...args: unknown[]) => getComplianceMock(...args),
}));

const axePage: RuntimeScanPageResult = {
  url: "https://app.example/",
  violations: [
    {
      id: "image-alt",
      impact: "critical",
      description: "Images must have alt text",
      help: "Images must have alt text",
      nodes: [{ html: '<img src="x">', target: ["img"] }],
    },
  ],
};

describe("ibmFindingsFromReport", () => {
  it("maps IBM violations to runtime dom findings", () => {
    const findings = ibmFindingsFromReport(
      {
        results: [
          {
            ruleId: "aria_content_in_landmark",
            level: "violation",
            message: "Content is not within a landmark element",
            snippet: '<a href="/help">',
            path: { dom: "/html[1]/body[1]/a[1]" },
          },
        ],
      },
      "https://app.example/",
      axePage,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("content-region");
    expect(findings[0]?.location).toMatchObject({
      kind: "dom",
      url: "https://app.example/",
      selector: "xpath:/html[1]/body[1]/a[1]",
    });
  });

  it("dedupes IBM findings when axe already reported the same check and snippet", () => {
    const pageWithBypass: RuntimeScanPageResult = {
      url: "https://app.example/",
      violations: [
        {
          id: "bypass",
          impact: "moderate",
          description: "Skip link",
          help: "Skip link",
          nodes: [{ html: "<body>", target: ["body"] }],
        },
      ],
    };
    const findings = ibmFindingsFromReport(
      {
        results: [
          {
            ruleId: "skip_main_exists",
            level: "violation",
            message: "No skip to main",
            snippet: "<body>",
            path: { dom: "/html[1]/body[1]" },
          },
        ],
      },
      "https://app.example/",
      pageWithBypass,
    );
    expect(findings).toHaveLength(0);
  });

  it("skips IBM when axe already reported the same check id (even with different snippet)", () => {
    const pageWithRegion: RuntimeScanPageResult = {
      url: "https://app.example/",
      violations: [
        {
          id: "region",
          impact: "moderate",
          description: "Content not in landmark",
          help: "Use landmarks",
          nodes: [{ html: "<main>", target: ["main"] }],
        },
      ],
    };
    const findings = ibmFindingsFromReport(
      {
        results: [
          {
            ruleId: "aria_content_in_landmark",
            level: "violation",
            message: "Content is not within a landmark element",
            snippet: '<a href="/help">Help</a>',
            path: { dom: "/html[1]/body[1]/a[1]" },
          },
        ],
      },
      "https://app.example/",
      pageWithRegion,
    );
    expect(findings).toHaveLength(0);
  });

  it("emits warning findings for heuristic check ids", () => {
    vi.spyOn(checkAuthority, "isHeuristicCheck").mockReturnValue(true);
    const findings = ibmFindingsFromReport(
      {
        results: [
          {
            ruleId: "error_message_exists",
            level: "violation",
            message: "Error message missing",
            snippet: "<input>",
          },
        ],
      },
      "https://app.example/",
      axePage,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("warning");
    expect(findings[0]?.confidence).toBe("medium");
    expect(findings[0]?.severity).toBe("moderate");
    vi.restoreAllMocks();
  });

  it("ignores unmapped and rejected IBM rules", () => {
    const findings = ibmFindingsFromReport(
      {
        results: [
          {
            ruleId: "style_focus_visible",
            level: "violation",
            message: "Focus",
            snippet: "<button>",
          },
          {
            ruleId: "img_alt_valid",
            level: "violation",
            message: "Alt",
            snippet: '<img src="x">',
          },
        ],
      },
      "https://app.example/",
      axePage,
    );
    expect(findings).toHaveLength(0);
  });
});

describe("ibmFindingsForPage", () => {
  it("disables IBM disk reports before scanning and maps the in-memory report", async () => {
    const emptyAxePage: RuntimeScanPageResult = {
      url: "https://www.kevin-sauvage.com/",
      violations: [],
    };
    const order: string[] = [];
    setConfigMock.mockImplementation(async () => {
      order.push("setConfig");
    });
    getComplianceMock.mockImplementation(async () => {
      order.push("getCompliance");
      return {
        report: {
          results: [
            {
              ruleId: "aria_content_in_landmark",
              level: "violation",
              message: "Content is not within a landmark element",
              snippet: '<a href="/help">',
              path: { dom: "/html[1]/body[1]/a[1]" },
            },
          ],
        },
      };
    });

    const findings = await ibmFindingsForPage(
      {},
      "https://www.kevin-sauvage.com/",
      emptyAxePage,
    );

    expect(setConfigMock).toHaveBeenCalledWith({ outputFormat: ["disable"] });
    expect(order).toEqual(["setConfig", "getCompliance"]);
    expect(getComplianceMock).toHaveBeenCalledWith(
      {},
      "complyloop-https-www-kevin-sauvage-com-",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("content-region");
  });
});
