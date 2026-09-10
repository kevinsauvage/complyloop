import "server-only";

import {
  REQUIREMENT_STATUSES,
  type RequirementStatus,
} from "@complyloop/analysis-core/contract/statuses";

import { formatDateTimeWithZone } from "@/core/datetime";
import { requirementStatusDisplay } from "@/core/display";

import {
  type AuditEvidenceRow,
  type AuditRequirementRow,
  composeAuditReport,
  composeEngineeringReport,
  type EngineeringReportModel,
  type ReportInput,
} from "../report-model";
import {
  emptyParagraph,
  escapeHtml,
  reportSection,
  reportShell,
  statusClass,
  summaryStat,
} from "./primitives";

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
    reportSection(
      "requirements",
      "Requirements",
      renderAuditRequirements(model.requirements),
    ),
    reportSection(
      "evidence",
      "Evidence trail",
      renderEvidence(model.evidence, {
        total: model.evidenceTotal,
        truncated: model.evidenceTruncated,
      }),
    ),
  ].join("\n");

  return reportShell(model.header, body);
}

export function buildEngineeringReportHtml(input: ReportInput): string {
  const model = composeEngineeringReport(input);

  const sections = [
    reportSection(
      "summary",
      "Summary",
      `<div class="summary-grid">
        ${summaryStat("Open findings", model.findings.length)}
        ${summaryStat("Shared root causes", model.clusters.length)}
      </div>`,
    ),
  ];

  if (model.clusters.length > 0) {
    sections.push(
      reportSection("clusters", "Shared root causes", renderClusters(model)),
    );
  }

  sections.push(
    reportSection(
      "findings",
      "Open findings",
      renderEngineeringFindings(model),
    ),
  );

  return reportShell(model.header, sections.join("\n"));
}

function renderEngineeringFindings(model: EngineeringReportModel): string {
  if (model.findings.length === 0) {
    return emptyParagraph("No open findings.");
  }

  return model.findings
    .map((finding) => {
      const snippet = finding.snippet
        ? `<pre class="snippet">${escapeHtml(finding.snippet)}</pre>`
        : "";
      const remediationLine = finding.remediationStatus
        ? `<p class="meta"><strong>Remediation:</strong> ${escapeHtml(finding.remediationStatus)}</p>`
        : "";

      return `<article class="finding-card">
  <header>
    <span class="badge severity-${finding.severityClass}">${escapeHtml(finding.severity)}</span>
    <code class="control-id">${escapeHtml(finding.code)}</code>
  </header>
  <p class="reason">${escapeHtml(finding.reason)}</p>
  <p class="meta"><strong>Location:</strong> <code>${escapeHtml(finding.locationRef)}</code></p>
  ${remediationLine}
  ${snippet}
</article>`;
    })
    .join("\n");
}

function renderClusters(model: EngineeringReportModel): string {
  if (model.clusters.length === 0) {
    return emptyParagraph("No shared root causes detected.");
  }
  const items = model.clusters
    .map(
      (cluster) =>
        `<li><strong>${escapeHtml(cluster.label)}</strong> — ${cluster.findingCount} open finding(s)</li>`,
    )
    .join("\n");
  return `<ul class="cluster-list">${items}</ul>`;
}

function renderEvidence(
  evidence: AuditEvidenceRow[],
  meta: { total: number; truncated: boolean },
): string {
  const truncationNote = meta.truncated
    ? `<p class="note">Showing the latest ${evidence.length} of ${meta.total} evidence records — download raw JSON for the full trail.</p>`
    : "";
  if (evidence.length === 0) {
    return emptyParagraph("No evidence records.");
  }

  const rows = evidence
    .map(
      (entry) =>
        `<tr>
  <td class="nowrap">${escapeHtml(formatDateTimeWithZone(entry.at))}</td>
  <td>${escapeHtml(entry.kindLabel)}</td>
  <td>${escapeHtml(entry.summary)}</td>
</tr>`,
    )
    .join("\n");

  return `${truncationNote}<table class="data-table evidence-table">
<thead><tr><th>When</th><th>Kind</th><th>Summary</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
}

function renderSummaryRows(counts: Record<RequirementStatus, number>): string {
  return REQUIREMENT_STATUSES.map(
    (status) =>
      `<tr><td><span class="badge ${statusClass(status)}">${escapeHtml(requirementStatusDisplay(status).label)}</span></td><td class="num">${counts[status]}</td></tr>`,
  ).join("\n");
}

function renderAuditRequirements(requirements: AuditRequirementRow[]): string {
  if (requirements.length === 0) {
    return emptyParagraph("No requirements recorded.");
  }

  const rows = requirements
    .map((req) => {
      const exceptionNote = req.exception?.note
        ? `<div class="note">${escapeHtml(req.exception.note)}</div>`
        : "";
      const exceptionReason = req.exception
        ? `<div class="note">Exception: ${escapeHtml(req.exception.reason)} · ${escapeHtml(formatDateTimeWithZone(req.exception.at))}</div>`
        : "";
      return `<tr>
  <td><code>${escapeHtml(req.code)}</code></td>
  <td>${escapeHtml(req.title)}</td>
  <td><span class="badge ${statusClass(req.status)}">${escapeHtml(req.statusLabel)}</span></td>
  <td class="muted">${escapeHtml(req.determinationLabel)}</td>
  <td class="nowrap muted">${escapeHtml(formatDateTimeWithZone(req.updatedAt))}</td>
</tr>${exceptionReason || exceptionNote ? `<tr class="exception-row"><td colspan="5">${exceptionReason}${exceptionNote}</td></tr>` : ""}`;
    })
    .join("\n");

  return `<table class="data-table">
<thead><tr><th>Control</th><th>Title</th><th>Status</th><th>Determination</th><th>Updated</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
}
