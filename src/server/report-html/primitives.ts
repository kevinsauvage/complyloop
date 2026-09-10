import "server-only";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import { formatDateTimeWithZone } from "@/core/lifecycle";
import {
  requirementStatusReportClass,
  severityDisplay,
  STATUS_TONE_REPORT,
} from "@/core/display";
import { projectSourceLabel, type ReportHeaderModel } from "../report-model";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function summaryStat(label: string, value: string | number): string {
  return `<div class="summary-stat"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(String(value))}</div></div>`;
}

export function emptyParagraph(message: string): string {
  return `<p class="empty">${escapeHtml(message)}</p>`;
}

export function reportSection(id: string, title: string, body: string): string {
  return `
    <section id="${escapeHtml(id)}">
      <h2>${escapeHtml(title)}</h2>
      ${body}
    </section>`;
}

export function statusClass(status: RequirementStatus): string {
  return requirementStatusReportClass(status);
}

/** CSS custom properties for the standalone report stylesheet. */
function reportCssVariables(): string {
  const tone = STATUS_TONE_REPORT;
  const severity = (name: Parameters<typeof severityDisplay>[0]) =>
    severityDisplay(name).report;
  return `
  --passed: ${tone.passed.fg};
  --passed-bg: ${tone.passed.bg};
  --failed: ${tone.failed.fg};
  --failed-bg: ${tone.failed.bg};
  --review: ${tone.review.fg};
  --review-bg: ${tone.review.bg};
  --na: ${tone.na.fg};
  --na-bg: ${tone.na.bg};
  --unable: ${tone.unverifiable.fg};
  --unable-bg: ${tone.unverifiable.bg};
  --critical: ${severity("critical").fg};
  --critical-bg: ${severity("critical").bg};
  --serious: ${severity("serious").fg};
  --serious-bg: ${severity("serious").bg};
  --moderate: ${severity("moderate").fg};
  --moderate-bg: ${severity("moderate").bg};
  --minor: ${severity("minor").fg};
  --minor-bg: ${severity("minor").bg};`;
}

const REPORT_STYLES = `
:root {
  --ink: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --surface: #f8fafc;
  --accent: #0891b2;
  ${reportCssVariables()}
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

export function reportShell(
  header: ReportHeaderModel,
  bodySections: string,
): string {
  const safeProjectName = escapeHtml(header.projectName);
  const source = projectSourceLabel(header);
  const githubMeta = header.githubFullName
    ? `<span><strong>GitHub:</strong> <code>${escapeHtml(header.githubFullName)}</code></span>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(header.title)} — ${safeProjectName}</title>
  <style>${REPORT_STYLES}</style>
</head>
<body>
  <div class="report">
    <header class="report-header">
      <h1>${escapeHtml(header.title)} — ${safeProjectName}</h1>
      <div class="report-meta">
        <span><strong>Framework:</strong> ${escapeHtml(header.frameworkName)} ${escapeHtml(header.frameworkVersion)}</span>
        <span><strong>Source:</strong> ${escapeHtml(source)}</span>
        ${githubMeta}
        <span><strong>Exported:</strong> ${escapeHtml(formatDateTimeWithZone(header.exportedAt))}</span>
      </div>
      <div class="no-print">
        <button type="button" onclick="window.print()">Print / Save as PDF</button>
      </div>
    </header>
    ${bodySections}
    <footer class="report-footer">
      Generated by ComplyLoop · ${escapeHtml(formatDateTimeWithZone(header.exportedAt))}
    </footer>
  </div>
</body>
</html>`;
}

