import { describe, expect, it } from "vitest";

import {
  reportSampleProject,
  sampleReportInput,
} from "@/test-fixtures/report-input";

import { buildReportHtml } from "./report";

describe("buildReportHtml", () => {
  it("renders the audit sections with styling and print affordances", async () => {
    const html = await buildReportHtml(sampleReportInput());

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="en">');
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

  it("wires the print button through a nonce'd script, never an inline handler", async () => {
    const html = await buildReportHtml(sampleReportInput(), "n0nce");

    // The page CSP (nonce + strict-dynamic) blocks inline event handlers.
    expect(html).not.toContain("onclick");
    expect(html).toContain('<script nonce="n0nce">');
    expect(html).toContain('id="print-report"');
  });

  it("escapes HTML in user-controlled fields", async () => {
    const input = sampleReportInput();
    input.project = {
      ...reportSampleProject,
      name: '<script>alert("x")</script>',
    };
    input.evidence = [
      { ...input.evidence[0]!, summary: '<img src=x onerror="alert(1)">' },
    ];

    const html = await buildReportHtml(input);

    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("shows placeholders when there is no evidence and no requirements", async () => {
    const input = sampleReportInput();
    input.requirements = [];
    input.evidence = [];
    const html = await buildReportHtml(input);
    expect(html).toContain("No evidence records.");
    expect(html).toContain("No requirements recorded.");
    expect(html).toContain("0%");
  });

  it("keeps an exception note and its reason in the requirements table", async () => {
    const html = await buildReportHtml(sampleReportInput());

    expect(html).toContain("exception-row");
    expect(html).toContain("Marketing microsite excluded from scope");
  });
});
