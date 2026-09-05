import { composeAuditReport, type ReportInput } from "../report-model";
import { renderEvidence } from "./evidence-section";
import { renderRequirements, renderSummaryRows } from "./requirements-section";
import { reportSection, reportShell, summaryStat } from "./shared";

export function buildAuditReportHtml(input: ReportInput): string {
  const model = composeAuditReport(input);
  const { statusCounts, totalRequirements, passRate, findingCounts } = model;

  const summaryBody = `
      <div class="summary-grid">
        ${summaryStat("Total", totalRequirements)}
        ${summaryStat("Passed", statusCounts.passed)}
        ${summaryStat("Failed", statusCounts.failed)}
        ${summaryStat("Pass rate", `${passRate}%`)}
        ${summaryStat("Open findings", findingCounts.open)}
      </div>
      <table class="data-table">
        <thead><tr><th>Status</th><th>Count</th></tr></thead>
        <tbody>
${renderSummaryRows(statusCounts)}
        </tbody>
      </table>`;

  const body = [
    reportSection("summary", "Summary", summaryBody),
    reportSection("requirements", "Requirements", renderRequirements(model.requirements)),
    reportSection("evidence", "Evidence trail", renderEvidence(model.evidence)),
  ].join("\n");

  return reportShell(model.header, body);
}
