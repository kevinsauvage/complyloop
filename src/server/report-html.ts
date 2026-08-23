import type { EvidenceRecord, Finding, Remediation } from "@/core/finding-types";
import {
  remediationStatusLabel,
  requirementStatusLabel,
  severityLabel,
} from "@/core/labels";
import type { Requirement } from "@/core/project-types";
import type { RequirementStatus } from "@/core/statuses";
import type { ReportInput } from "./report";

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
  controlsById: Map<string, { title: string }>,
): string {
  if (requirements.length === 0) {
    return `<p class="empty">No requirements recorded.</p>`;
  }

  const rows = requirements
    .map((req) => {
      const control = controlsById.get(req.controlId);
      const title = control?.title ?? req.controlId;
      const exceptionNote = req.exception?.note
        ? `<div class="note">${escapeHtml(req.exception.note)}</div>`
        : "";
      return `<tr>
  <td><code>${escapeHtml(req.controlId)}</code></td>
  <td>${escapeHtml(title)}</td>
  <td><span class="badge ${statusClass(req.status)}">${escapeHtml(requirementStatusLabel(req.status))}</span></td>
  <td class="muted">${escapeHtml(req.determination === "automated" ? "Automated" : "Human review")}</td>
</tr>${exceptionNote ? `<tr class="exception-row"><td colspan="4">${exceptionNote}</td></tr>` : ""}`;
    })
    .join("\n");

  return `<table class="data-table">
<thead><tr><th>Control</th><th>Title</th><th>Status</th><th>Determination</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
}

function renderFindings(
  findings: Finding[],
  remediationsByFinding: Map<string, Remediation>,
): string {
  if (findings.length === 0) {
    return `<p class="empty">No open findings.</p>`;
  }

  return findings
    .map((finding) => {
      const remediation = remediationsByFinding.get(finding.id);
      const location =
        finding.location.kind === "source"
          ? `${finding.location.filePath}:${finding.location.line}`
          : finding.location.url;
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
    <code class="control-id">${escapeHtml(finding.controlId)}</code>
    <span class="muted">${escapeHtml(finding.status)}</span>
  </header>
  <p class="reason">${escapeHtml(finding.reason)}</p>
  <p class="meta"><strong>Location:</strong> <code>${escapeHtml(location)}</code></p>
  ${remediationLine}
  ${snippet}
</article>`;
    })
    .join("\n");
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
  <td><code>${escapeHtml(entry.kind)}</code></td>
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
    margin: 1.5cm;
  }

  body { background: #fff; }

  .report {
    max-width: none;
    padding: 0;
  }

  .no-print { display: none !important; }

  section { break-inside: avoid-page; }

  section h2 { break-after: avoid; }

  .data-table { font-size: 0.75rem; }

  .data-table th,
  .data-table td { padding: 0.375rem 0.5rem; }

  .finding-card,
  .summary-stat,
  .badge {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  a[href]::after { content: none !important; }
}
`;

export function buildComplianceReportHtml(input: ReportInput): string {
  const { project, framework, controls, requirements, findings, remediations, evidence, exportedAt } =
    input;

  const counts: Record<RequirementStatus, number> = {
    passed: 0,
    failed: 0,
    needs_review: 0,
    not_applicable: 0,
    unable_to_verify: 0,
  };
  for (const req of requirements) {
    counts[req.status] += 1;
  }

  const controlsById = new Map(controls.map((c) => [c.id, c]));
  const remediationsByFinding = new Map(remediations.map((r) => [r.findingId, r]));
  const openFindings = findings.filter((f) => f.status === "open");
  const totalRequirements = requirements.length;
  const passRate =
    totalRequirements > 0
      ? Math.round((counts.passed / totalRequirements) * 100)
      : 0;

  const safeProjectName = escapeHtml(project.name);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Compliance report — ${safeProjectName}</title>
  <style>${REPORT_STYLES}</style>
</head>
<body>
  <div class="report">
    <header class="report-header">
      <h1>Compliance report — ${safeProjectName}</h1>
      <div class="report-meta">
        <span><strong>Framework:</strong> ${escapeHtml(framework.name)} ${escapeHtml(framework.version)}</span>
        <span><strong>Source:</strong> ${escapeHtml(project.sourceRef ?? project.source)}</span>
        <span><strong>Exported:</strong> ${escapeHtml(formatDateTime(exportedAt))}</span>
      </div>
      <div class="no-print">
        <button type="button" onclick="window.print()">Print / Save as PDF</button>
      </div>
    </header>

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
      ${renderRequirements(requirements, controlsById)}
    </section>

    <section id="findings">
      <h2>Findings</h2>
      ${renderFindings(openFindings, remediationsByFinding)}
    </section>

    <section id="evidence">
      <h2>Evidence trail</h2>
      ${renderEvidence(evidence)}
    </section>

    <footer class="report-footer">
      Generated by ComplyLoop · ${escapeHtml(formatDateTime(exportedAt))}
    </footer>
  </div>
</body>
</html>`;
}
