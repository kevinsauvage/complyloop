import type { EvidenceRecord } from "@complyloop/analysis-core/contract/finding-types";
import { evidenceKindLabel } from "@/core/labels";
import { countRequirementsByStatus, type ReportInput } from "../report";
import { formatDateTime } from "@/core/format-datetime";
import { escapeHtml, reportShell } from "./shared";
import { renderRequirements, renderSummaryRows } from "./requirements-section";

function renderEvidence(evidence: EvidenceRecord[]): string {
  if (evidence.length === 0) {
    return `<p class="empty">No evidence records.</p>`;
  }

  const rows = evidence
    .map(
      (entry) =>
        `<tr>
  <td class="nowrap">${escapeHtml(formatDateTime(entry.at))}</td>
  <td>${escapeHtml(evidenceKindLabel(entry.kind))}</td>
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
  const { controls, requirements, findings, evidence } = input;

  const counts = countRequirementsByStatus(requirements);

  const controlsById = new Map(controls.map((c) => [c.id, c]));
  const openFindings = findings.filter((f) => f.status === "open");
  const totalRequirements = requirements.length;
  const passRate =
    totalRequirements > 0
      ? Math.round((counts.passed / totalRequirements) * 100)
      : 0;

  const body = `
    <section id="summary">
      <h2>Summary</h2>
      <div class="summary-grid">
        <div class="summary-stat"><div class="label">Total</div><div class="value">${totalRequirements}</div></div>
        <div class="summary-stat"><div class="label">Passed</div><div class="value">${counts.passed}</div></div>
        <div class="summary-stat"><div class="label">Failed</div><div class="value">${counts.failed}</div></div>
        <div class="summary-stat"><div class="label">Pass rate</div><div class="value">${passRate}%</div></div>
        <div class="summary-stat"><div class="label">Open findings</div><div class="value">${openFindings.length}</div></div>
      </div>
      <table class="data-table">
        <thead><tr><th>Status</th><th>Count</th></tr></thead>
        <tbody>
${renderSummaryRows(counts)}
        </tbody>
      </table>
    </section>

    <section id="requirements">
      <h2>Requirements</h2>
      ${renderRequirements(requirements, controlsById, input.framework.id)}
    </section>

    <section id="evidence">
      <h2>Evidence trail</h2>
      ${renderEvidence([...evidence].reverse())}
    </section>`;

  return reportShell("Audit report", input, body);
}
