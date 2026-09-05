import { composeEngineeringReport, type EngineeringReportModel } from "../report-model";
import type { ReportInput } from "../report";
import { escapeHtml, reportShell } from "./shared";

function renderEngineeringFindings(model: EngineeringReportModel): string {
  if (model.findings.length === 0) {
    return `<p class="empty">No open findings.</p>`;
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
    return `<p class="empty">No shared root causes detected.</p>`;
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
  const openFindings =
    model.metrics.find((metric) => metric.label === "Open findings")?.value ?? 0;
  const clusterCount =
    model.metrics.find((metric) => metric.label === "Shared root causes")?.value ??
    0;

  const body = `
    <section id="summary">
      <h2>Summary</h2>
      <div class="summary-grid">
        <div class="summary-stat"><div class="label">Open findings</div><div class="value">${openFindings}</div></div>
        <div class="summary-stat"><div class="label">Shared root causes</div><div class="value">${clusterCount}</div></div>
      </div>
    </section>

    <section id="clusters">
      <h2>Shared root causes</h2>
      ${renderClusters(model)}
    </section>

    <section id="findings">
      <h2>Open findings</h2>
      ${renderEngineeringFindings(model)}
    </section>`;

  return reportShell("Engineering report", input, body);
}
