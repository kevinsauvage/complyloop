import { describe, expect, it } from "vitest";
import { reportSampleProject, sampleReportInput } from "@/test-fixtures/report-input";
import { buildAuditReportHtml } from "./audit";

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

  it("escapes HTML in user-controlled fields", () => {
    const input = sampleReportInput();
    input.project = {
      ...reportSampleProject,
      name: '<script>alert("x")</script>',
    };

    const html = buildAuditReportHtml(input);

    expect(html).not.toContain("<script>");
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
