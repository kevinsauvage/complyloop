import { describe, expect, it } from "vitest";
import type { Finding } from "@complyloop/analysis-core/contract/finding-types";
import { sampleReportInput } from "@/test-fixtures/report-input";
import { buildEngineeringReportHtml } from "./engineering";

describe("buildEngineeringReportHtml", () => {
  it("renders open findings with snippets and no requirements table", () => {
    const html = buildEngineeringReportHtml(sampleReportInput());

    expect(html).toContain("Engineering report — demo-app");
    expect(html).toContain('id="findings"');
    expect(html).toContain("Button.tsx:4");
    expect(html).toContain("&lt;button&gt;&lt;svg /&gt;&lt;/button&gt;");
    expect(html).toContain("severity-critical");
    expect(html).not.toContain('id="requirements"');
  });

  it("escapes HTML in finding reasons", () => {
    const input = sampleReportInput();
    input.findings[0] = {
      ...input.findings[0],
      reason: 'Reason with <img onerror="x">',
    };

    const html = buildEngineeringReportHtml(input);

    expect(html).toContain("&lt;img onerror=");
  });

  it("shows placeholders when there are no open findings", () => {
    const input = sampleReportInput();
    input.findings = [];
    input.remediations = [];
    const html = buildEngineeringReportHtml(input);
    expect(html).toContain("No open findings.");
    expect(html).toContain("No shared root causes detected.");
  });

  it("omits snippet and remediation lines when they are absent", () => {
    const input = sampleReportInput();
    input.findings[0] = {
      ...input.findings[0],
      location: {
        kind: "source",
        filePath: "Empty.tsx",
        line: 1,
        column: 1,
        snippet: "",
        span: { start: 0, end: 0 },
      },
    };
    input.remediations = [];
    const html = buildEngineeringReportHtml(input);
    expect(html).not.toContain("<pre class=\"snippet\">");
    expect(html).not.toContain("<strong>Remediation:</strong>");
  });

  it("lists clusters when open findings share a root cause", () => {
    const input = sampleReportInput();
    const second: Finding = {
      ...input.findings[0],
      id: "f2",
      location: {
        kind: "source",
        filePath: "Button.tsx",
        line: 22,
        column: 1,
        snippet: "<button><svg /></button>",
        span: { start: 0, end: 24 },
      },
    };
    input.findings = [input.findings[0], second];
    input.remediations = [
      { id: "rem1", findingId: "f1", status: "detected", suggestion: null, history: [] },
      { id: "rem2", findingId: "f2", status: "detected", suggestion: null, history: [] },
    ];

    const html = buildEngineeringReportHtml(input);

    expect(html).toContain("Shared root causes");
    expect(html).toContain("findings share");
    expect(html).toContain('class="cluster-list"');
  });
});
