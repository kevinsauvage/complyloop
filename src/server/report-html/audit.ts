import { formatDateTime } from "@/core/format-datetime";
import { composeAuditReport, type AuditReportModel } from "../report-model";
import type { ReportInput } from "../report";
import { escapeHtml, reportShell } from "./shared";
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
        <div class="summary-stat"><div class="label">Total</div><div class="value">${totalRequirements}</div></div>
        <div class="summary-stat"><div class="label">Passed</div><div class="value">${statusCounts.passed}</div></div>
        <div class="summary-stat"><div class="label">Failed</div><div class="value">${statusCounts.failed}</div></div>
        <div class="summary-stat"><div class="label">Pass rate</div><div class="value">${passRate}%</div></div>
        <div class="summary-stat"><div class="label">Open findings</div><div class="value">${findingCounts.open}</div></div>
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

  return reportShell("Audit report", input, body);
}
