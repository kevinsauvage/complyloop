import { formatDateTime } from "@/core/format-datetime";
import { composeAuditReport, type AuditReportModel, type ReportInput } from "../report-model";
import { escapeHtml, reportShell, summaryStat } from "./shared";
import { renderRequirements, renderSummaryRows } from "./requirements-section";

function renderEvidence(model: AuditReportModel): string {
  if (model.evidence.length === 0) {
    return `<p class="empty">No evidence records.</p>`;
  }

  const rows = model.evidence
    .map(
      (entry) =>
        `<tr>
  <td class="nowrap">${escapeHtml(formatDateTime(entry.at))}</td>
  <td>${escapeHtml(entry.kindLabel)}</td>
  <td>${escapeHtml(entry.summary)}</td>
</tr>`,
    )
    .join("\n");

  return `<table class="data-table evidence-table">
<thead><tr><th>When</th><th>Kind</th><th>Summary</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
}

export function buildAuditReportHtml(input: ReportInput): string {
  const model = composeAuditReport(input);
  const { statusCounts, totalRequirements, passRate, findingCounts } = model;

  const body = `
    <section id="summary">
      <h2>Summary</h2>
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
      </table>
    </section>

    <section id="requirements">
      <h2>Requirements</h2>
      ${renderRequirements(model.requirements)}
    </section>

    <section id="evidence">
      <h2>Evidence trail</h2>
      ${renderEvidence(model)}
    </section>`;

  return reportShell(model.header, body);
}
