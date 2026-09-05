import { describe, expect, it } from "vitest";
import { sampleReportInput } from "@/test-fixtures/report-input";
import { buildAuditReportHtml } from "./report-html/audit";
import { buildEngineeringReportHtml } from "./report-html/engineering";
import { buildAuditReportMarkdown } from "./report";
import { composeAuditReport, composeEngineeringReport } from "./report-model";

describe("report model composers", () => {
  it("labels evidence kinds once so markdown and HTML stay in sync", () => {
    const input = sampleReportInput();
    input.evidence.push({
      id: "e-kind",
      at: "2026-01-03T00:00:00.000Z",
      kind: "finding_detected",
      summary: "New finding recorded",
      projectId: input.project.id,
    });

    const model = composeAuditReport(input);
    expect(model.evidence.map((row) => row.kindLabel)).toEqual([
      "Finding detected",
      "Assessment completed",
    ]);

    const markdown = buildAuditReportMarkdown(input);
    const html = buildAuditReportHtml(input);
    expect(markdown).toContain("Finding detected");
    expect(markdown).not.toContain("finding_detected");
    expect(html).toContain("Finding detected");
    expect(html).not.toContain("finding_detected");
  });

  it("feeds engineering findings to both renderers from one model", () => {
    const model = composeEngineeringReport(sampleReportInput());
    expect(model.findings).toHaveLength(1);
    expect(model.findings[0]?.locationRef).toBe("Button.tsx:4");

    const html = buildEngineeringReportHtml(sampleReportInput());
    expect(html).toContain(model.findings[0]!.reason);
    expect(html).toContain(model.findings[0]!.locationRef);
  });
});
