import { describe, expect, it } from "vitest";
import { ibmFindingsFromReport } from "./ibm-runtime";
import type { RuntimeScanPageResult } from "./findings";

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
