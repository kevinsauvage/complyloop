import type { EvidenceRecord, Finding, Remediation } from "@/core/finding-types";
import {
  evidenceKindLabel,
  remediationStatusLabel,
  requirementStatusLabel,
  severityLabel,
} from "@/core/labels";
import { prioritizeClusters } from "@/core/prioritization";
import type { Control, Requirement } from "@/core/project-types";
import type { RequirementStatus } from "@/core/statuses";
import { formatLocationRef } from "@/core/location";
import { controlDisplayCodes } from "@/adapters/control-theme";
import { countRequirementsByStatus, type ReportInput } from "./report";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusClass(status: RequirementStatus): string {
  switch (status) {
    case "passed":
      return "status-passed";
    case "failed":
      return "status-failed";
    case "needs_review":
      return "status-needs-review";
    case "not_applicable":
      return "status-not-applicable";
    case "unable_to_verify":
      return "status-unable";
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled requirement status: ${_exhaustive}`);
    }
  }
}

function renderSummaryRows(counts: Record<RequirementStatus, number>): string {
  return (Object.keys(counts) as RequirementStatus[])
    .map(
      (status) =>
        `<tr><td><span class="badge ${statusClass(status)}">${escapeHtml(requirementStatusLabel(status))}</span></td><td class="num">${counts[status]}</td></tr>`,
    )
    .join("\n");
}

function renderRequirements(
  requirements: Requirement[],
  controlsById: Map<string, Control>,
  frameworkId: string,
): string {
  if (requirements.length === 0) {
    return `<p class="empty">No requirements recorded.</p>`;
  }

  const rows = requirements
    .map((req) => {
      const control = controlsById.get(req.controlId);
      const title = control?.title ?? req.controlId;
      const code = control
        ? controlDisplayCodes(control, frameworkId).code
        : req.controlId;
      const exceptionNote = req.exception?.note
        ? `<div class="note">${escapeHtml(req.exception.note)}</div>`
        : "";
      const exceptionReason = req.exception
        ? `<div class="note">Exception: ${escapeHtml(req.exception.reason.replace(/_/g, " "))} · ${escapeHtml(formatDateTime(req.exception.at))}</div>`
        : "";
      return `<tr>
  <td><code>${escapeHtml(code)}</code></td>
  <td>${escapeHtml(title)}</td>
  <td><span class="badge ${statusClass(req.status)}">${escapeHtml(requirementStatusLabel(req.status))}</span></td>
  <td class="muted">${escapeHtml(req.determination === "automated" ? "Automated" : "Human review")}</td>
  <td class="nowrap muted">${escapeHtml(formatDateTime(req.updatedAt))}</td>
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

const REPORT_STYLES = `
:root {
  --ink: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --surface: #f8fafc;
  --accent: #0891b2;
  --passed: #15803d;
  --passed-bg: #dcfce7;
  --failed: #b91c1c;
  --failed-bg: #fee2e2;
  --review: #b45309;
  --review-bg: #fef3c7;
  --na: #475569;
  --na-bg: #f1f5f9;
  --unable: #6d28d9;
  --unable-bg: #ede9fe;
  --critical: #991b1b;
  --critical-bg: #fecaca;
  --serious: #c2410c;
  --serious-bg: #ffedd5;
  --moderate: #a16207;
  --moderate-bg: #fef9c3;
  --minor: #0369a1;
  --minor-bg: #e0f2fe;
}

* { box-sizing: border-box; }

body {
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  color: var(--ink);
  line-height: 1.55;
  margin: 0;
  background: #fff;
}

.report {
  max-width: 56rem;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
}

.report-header {
  border-bottom: 2px solid var(--ink);
  padding-bottom: 1.25rem;
  margin-bottom: 2rem;
}

.report-header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0 0 0.5rem;
  letter-spacing: -0.02em;
}

.report-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  font-size: 0.875rem;
  color: var(--muted);
}

.report-meta strong { color: var(--ink); }

.no-print {
  margin-top: 1rem;
}

.no-print button {
  font: inherit;
  font-size: 0.875rem;
  padding: 0.5rem 1rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  background: var(--surface);
  cursor: pointer;
}

.no-print button:hover { border-color: var(--accent); color: var(--accent); }

section {
  margin-bottom: 2.5rem;
}

section h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 1rem;
  padding-bottom: 0.375rem;
  border-bottom: 1px solid var(--border);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.summary-stat {
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--surface);
}

.summary-stat .label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.summary-stat .value {
  font-size: 1.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.data-table th,
.data-table td {
  border: 1px solid var(--border);
  padding: 0.5rem 0.625rem;
  text-align: left;
  vertical-align: top;
}

.data-table th {
  background: var(--surface);
  font-weight: 600;
}

.data-table .num { text-align: right; font-variant-numeric: tabular-nums; }

.data-table .nowrap { white-space: nowrap; }

.exception-row td {
  background: var(--surface);
  border-top: none;
  padding-top: 0;
}

.note {
  font-size: 0.8125rem;
  color: var(--muted);
  font-style: italic;
}

.cluster-list {
  margin: 0;
  padding-left: 1.25rem;
}

.badge {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  white-space: nowrap;
}

.status-passed { background: var(--passed-bg); color: var(--passed); }
.status-failed { background: var(--failed-bg); color: var(--failed); }
.status-needs-review { background: var(--review-bg); color: var(--review); }
.status-not-applicable { background: var(--na-bg); color: var(--na); }
.status-unable { background: var(--unable-bg); color: var(--unable); }

.severity-critical { background: var(--critical-bg); color: var(--critical); }
.severity-serious { background: var(--serious-bg); color: var(--serious); }
.severity-moderate { background: var(--moderate-bg); color: var(--moderate); }
.severity-minor { background: var(--minor-bg); color: var(--minor); }

.finding-card {
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 1rem 1.125rem;
  margin-bottom: 0.75rem;
  break-inside: avoid;
  page-break-inside: avoid;
}

.finding-card header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.finding-card .reason { margin: 0 0 0.5rem; }

.finding-card .meta {
  margin: 0 0 0.5rem;
  font-size: 0.8125rem;
  color: var(--muted);
}

.finding-card .meta strong { color: var(--ink); }

.snippet {
  margin: 0.5rem 0 0;
  padding: 0.625rem 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  font-size: 0.75rem;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.empty { color: var(--muted); font-style: italic; }

.muted { color: var(--muted); }

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85em;
}

.report-footer {
  margin-top: 3rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  font-size: 0.75rem;
  color: var(--muted);
  text-align: center;
}

@media print {
  @page {
    size: A4;
    margin: 1.6cm 1.4cm 2cm;
  }

  @page :first {
    margin-top: 1.4cm;
  }

  html {
    font-size: 11pt;
  }

  body {
    background: #fff !important;
    color: #0f172a !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .report {
    max-width: none;
    padding: 0;
  }

  .no-print {
    display: none !important;
  }

  .report-header {
    border-bottom-width: 1.5pt;
    margin-bottom: 1.25rem;
    padding-bottom: 0.75rem;
  }

  .report-header h1 {
    font-size: 18pt;
  }

  .report-meta {
    font-size: 9pt;
    gap: 0.35rem 1rem;
  }

  section {
    margin-bottom: 1.5rem;
    break-inside: auto;
  }

  section h2 {
    font-size: 12pt;
    break-after: avoid;
    page-break-after: avoid;
  }

  .summary-grid {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .summary-stat {
    border-color: #cbd5e1;
    background: #f8fafc !important;
  }

  .data-table {
    font-size: 8.5pt;
    border-collapse: collapse;
  }

  .data-table thead {
    display: table-header-group;
  }

  .data-table tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .data-table th,
  .data-table td {
    padding: 0.3rem 0.4rem;
    border-color: #cbd5e1;
  }

  .data-table th {
    background: #f1f5f9 !important;
  }

  .finding-card {
    break-inside: avoid;
    page-break-inside: avoid;
    margin-bottom: 0.6rem;
    border-color: #cbd5e1;
  }

  .snippet {
    background: #f8fafc !important;
    border-color: #cbd5e1;
    font-size: 8pt;
  }

  .finding-card,
  .summary-stat,
  .badge,
  .data-table th {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .report-footer {
    break-before: avoid;
    margin-top: 1.5rem;
    font-size: 8pt;
  }

  a[href]::after {
    content: none !important;
  }

  p, li {
    orphans: 2;
    widows: 2;
  }
}
`;

function reportShell(
  title: string,
  input: ReportInput,
  bodySections: string,
): string {
  const { project, framework, exportedAt } = input;
  const safeProjectName = escapeHtml(project.name);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — ${safeProjectName}</title>
  <style>${REPORT_STYLES}</style>
</head>
<body>
  <div class="report">
    <header class="report-header">
      <h1>${escapeHtml(title)} — ${safeProjectName}</h1>
      <div class="report-meta">
        <span><strong>Framework:</strong> ${escapeHtml(framework.name)} ${escapeHtml(framework.version)}</span>
        <span><strong>Source:</strong> ${escapeHtml(project.sourceRef ?? project.source)}</span>
        <span><strong>Exported:</strong> ${escapeHtml(formatDateTime(exportedAt))}</span>
      </div>
      <div class="no-print">
        <button type="button" onclick="window.print()">Print / Save as PDF</button>
      </div>
    </header>
    ${bodySections}
    <footer class="report-footer">
      Generated by ComplyLoop · ${escapeHtml(formatDateTime(exportedAt))}
    </footer>
  </div>
</body>
</html>`;
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