import {
  composeEngineeringReport,
  type EngineeringReportModel,
  type ReportInput,
} from "../report-model";
import { emptyParagraph, escapeHtml, reportSection, reportShell, summaryStat } from "./shared";

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
    reportSection("findings", "Open findings", renderEngineeringFindings(model)),
  );

  return reportShell(model.header, sections.join("\n"));
}
