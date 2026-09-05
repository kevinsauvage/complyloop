import { requirementStatusLabel } from "@/core/labels";
import { formatDateTime } from "@/core/format-datetime";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import type { AuditRequirementRow } from "../report-model";
import { escapeHtml, statusClass } from "./shared";

export function renderSummaryRows(counts: Record<RequirementStatus, number>): string {
  return (Object.keys(counts) as RequirementStatus[])
    .map(
      (status) =>
        `<tr><td><span class="badge ${statusClass(status)}">${escapeHtml(requirementStatusLabel(status))}</span></td><td class="num">${counts[status]}</td></tr>`,
    )
    .join("\n");
}

export function renderRequirements(requirements: AuditRequirementRow[]): string {
  if (requirements.length === 0) {
    return `<p class="empty">No requirements recorded.</p>`;
  }

  const rows = requirements
    .map((req) => {
      const exceptionNote = req.exception?.note
        ? `<div class="note">${escapeHtml(req.exception.note)}</div>`
        : "";
      const exceptionReason = req.exception
        ? `<div class="note">Exception: ${escapeHtml(req.exception.reason)} · ${escapeHtml(formatDateTime(req.exception.at))}</div>`
        : "";
      return `<tr>
  <td><code>${escapeHtml(req.code)}</code></td>
  <td>${escapeHtml(req.title)}</td>
  <td><span class="badge ${statusClass(req.status)}">${escapeHtml(req.statusLabel)}</span></td>
  <td class="muted">${escapeHtml(req.determinationLabel)}</td>
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
