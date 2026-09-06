import { formatDateTimeWithZone } from "@/core/format-datetime";
import type { AuditEvidenceRow } from "../report-model";
import { emptyParagraph, escapeHtml } from "./shared";

export function renderEvidence(evidence: AuditEvidenceRow[]): string {
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

  return `<table class="data-table evidence-table">
<thead><tr><th>When</th><th>Kind</th><th>Summary</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
}
