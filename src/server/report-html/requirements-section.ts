import { determinationLabel, requirementStatusLabel } from "@/core/labels";
import { formatDateTime } from "@/core/format-datetime";
import type { Control, Requirement } from "@/core/project-types";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import { controlDisplayCodes } from "@/adapters/control-theme";
import { escapeHtml, statusClass } from "./shared";

export function renderSummaryRows(counts: Record<RequirementStatus, number>): string {
  return (Object.keys(counts) as RequirementStatus[])
    .map(
      (status) =>
        `<tr><td><span class="badge ${statusClass(status)}">${escapeHtml(requirementStatusLabel(status))}</span></td><td class="num">${counts[status]}</td></tr>`,
    )
    .join("\n");
}

export function renderRequirements(
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
  <td class="muted">${escapeHtml(determinationLabel(req.determination))}</td>
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
