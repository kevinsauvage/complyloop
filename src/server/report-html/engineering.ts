import type { Finding, Remediation } from "@complyloop/analysis-core/contract/finding-types";
import { remediationStatusLabel, severityLabel } from "@/core/labels";
import { prioritizeClusters } from "@/core/prioritization";
import type { Control } from "@complyloop/domain/project-types";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import { controlDisplayCodes } from "@complyloop/adapters/control-theme";
import type { ReportInput } from "../report";
import { escapeHtml, reportShell } from "./shared";

function renderEngineeringFindings(
  findings: Finding[],
  remediationsByFinding: Map<string, Remediation>,
  controlsById: Map<string, Control>,
  frameworkId: string,
): string {
  if (findings.length === 0) {
    return `<p class="empty">No open findings.</p>`;
  }

  return findings
    .map((finding) => {
      const remediation = remediationsByFinding.get(finding.id);
      const control = controlsById.get(finding.controlId);
      const code = control
        ? controlDisplayCodes(control, frameworkId).code
        : finding.controlId;
      const location = formatLocationRef(finding.location);
      const snippet =
        finding.location.kind === "source" && finding.location.snippet
          ? `<pre class="snippet">${escapeHtml(finding.location.snippet)}</pre>`
          : "";
      const remediationLine = remediation
        ? `<p class="meta"><strong>Remediation:</strong> ${escapeHtml(remediationStatusLabel(remediation.status))}</p>`
        : "";

      return `<article class="finding-card">
  <header>
    <span class="badge severity-${finding.severity}">${escapeHtml(severityLabel(finding.severity))}</span>
    <code class="control-id">${escapeHtml(code)}</code>
  </header>
  <p class="reason">${escapeHtml(finding.reason)}</p>
  <p class="meta"><strong>Location:</strong> <code>${escapeHtml(location)}</code></p>
  ${remediationLine}
  ${snippet}
</article>`;
    })
    .join("\n");
}

function renderClusters(
  clusters: ReturnType<typeof prioritizeClusters>,
): string {
  if (clusters.length === 0) {
    return `<p class="empty">No shared root causes detected.</p>`;
  }
  const items = clusters
    .map(
      (cluster) =>
        `<li><strong>${escapeHtml(cluster.label)}</strong> — ${cluster.findingIds.length} open finding(s)</li>`,
    )
    .join("\n");
  return `<ul class="cluster-list">${items}</ul>`;
}

export function buildEngineeringReportHtml(input: ReportInput): string {
  const { framework, controls, findings, remediations } = input;
  const controlsById = new Map(controls.map((c) => [c.id, c]));
  const remediationsByFinding = new Map(remediations.map((r) => [r.findingId, r]));
  const openFindings = findings.filter((f) => f.status === "open");
  const clusters = prioritizeClusters(openFindings, controls);

  const body = `
    <section id="summary">
      <h2>Summary</h2>
      <div class="summary-grid">
        <div class="summary-stat"><div class="label">Open findings</div><div class="value">${openFindings.length}</div></div>
        <div class="summary-stat"><div class="label">Shared root causes</div><div class="value">${clusters.length}</div></div>
      </div>
    </section>

    <section id="clusters">
      <h2>Shared root causes</h2>
      ${renderClusters(clusters)}
    </section>

    <section id="findings">
      <h2>Open findings</h2>
      ${renderEngineeringFindings(openFindings, remediationsByFinding, controlsById, framework.id)}
    </section>`;

  return reportShell("Engineering report", input, body);
}
