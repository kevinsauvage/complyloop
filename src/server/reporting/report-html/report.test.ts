import { describe, expect, it } from "vitest";

import {
  reportSampleProject,
  sampleReportInput,
} from "@/test-fixtures/report-input";

import { buildAuditReportHtml, buildEngineeringReportHtml } from "./report";

describe("buildAuditReportHtml", () => {
  it("renders structured sections with styling and print affordances", () => {
    const html = buildAuditReportHtml(sampleReportInput());

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Audit report — demo-app");
    expect(html).toContain('id="summary"');
    expect(html).toContain('id="requirements"');
    expect(html).toContain('id="evidence"');
    expect(html).not.toContain('id="findings"');
    expect(html).toContain("status-not-applicable");
    expect(html).toContain("Marketing microsite excluded from scope");
    expect(html).toContain("Assessment completed");
    expect(html).not.toContain("assessment_completed");
    expect(html).toContain("@media print");
    expect(html).toContain("window.print()");
    expect(html).toContain("print-color-adjust: exact");
    expect(html).toContain("display: table-header-group");
    expect(html).toContain("page-break-inside: avoid");
  });

  it("wires the print button through a nonce'd script, never an inline handler", () => {
    const html = buildAuditReportHtml(sampleReportInput(), "n0nce");

    // The page CSP (nonce + strict-dynamic) blocks inline event handlers.
    expect(html).not.toContain("onclick");
    expect(html).toContain('<script nonce="n0nce">');
    expect(html).toContain('id="print-report"');
  });

  it("escapes HTML in user-controlled fields", () => {
    const input = sampleReportInput();
    input.project = {
      ...reportSampleProject,
      name: '<script>alert("x")</script>',
    };

    const html = buildAuditReportHtml(input);

    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("shows placeholders when there is no evidence and no requirements", () => {
    const input = sampleReportInput();
    input.requirements = [];
    input.evidence = [];
    const html = buildAuditReportHtml(input);
    expect(html).toContain("No evidence records.");
    expect(html).toContain("No requirements recorded.");
    expect(html).toContain("0%");
  });
});

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

  it("states the exact open total when the open-finding list was capped", () => {
    const input = sampleReportInput();
    input.findingCounts = { ...input.findingCounts, open: 7_500 };

    const html = buildEngineeringReportHtml(input);

    expect(html).toContain(
      `Showing the ${input.findings.length} most severe of 7500 open findings.`,
    );
    expect(html).toMatch(/Open findings<\/div><div class="value">7500</);
  });

  it("escapes HTML in finding reasons", () => {
    const input = sampleReportInput();
    input.findings[0] = {
      ...input.findings[0]!,
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
  });

  it("omits snippet and remediation lines when they are absent", () => {
    const input = sampleReportInput();
    input.findings[0] = {
      ...input.findings[0]!,
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
    expect(html).not.toContain('<pre class="snippet">');
    expect(html).not.toContain("<strong>Remediation:</strong>");
  });
});
