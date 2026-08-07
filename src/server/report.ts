import type { RequirementStatus } from "@/core/statuses";
import type { Control, Framework, Project, Requirement } from "@/core/project-types";
import type { EvidenceRecord, Finding, Remediation } from "@/core/finding-types";
import { formatLocationRef } from "@/core/location";
import { requirementStatusLabel } from "@/core/labels";

export interface ReportInput {
  project: Project;
  framework: Framework;
  controls: Control[];
  requirements: Requirement[];
  findings: Finding[];
  remediations: Remediation[];
  evidence: EvidenceRecord[];
  exportedAt: string;
}

function statusCounts(requirements: Requirement[]): Record<RequirementStatus, number> {
  const counts: Record<RequirementStatus, number> = {
    passed: 0,
    failed: 0,
    needs_review: 0,
    not_applicable: 0,
    unable_to_verify: 0,
  };
  for (const requirement of requirements) {
    counts[requirement.status] += 1;
  }
  return counts;
}

function controlById(controls: Control[], id: string): Control | undefined {
  return controls.find((control) => control.id === id);
}

/** Builds a compliance/audit-oriented Markdown report for the active project. */
export function buildComplianceReportMarkdown(input: ReportInput): string {
  const {
    project,
    framework,
    controls,
    requirements,
    findings,
    remediations,
    evidence,
    exportedAt,
  } = input;
  const counts = statusCounts(requirements);
  const openFindings = findings.filter((finding) => finding.status === "open");
  const resolvedFindings = findings.filter((finding) => finding.status === "resolved");
  const dismissedFindings = findings.filter((finding) => finding.status === "dismissed");

  const lines: string[] = [
    `# Compliance report — ${project.name}`,
    ``,
    `**Exported:** ${exportedAt}`,
    `**Framework:** ${framework.name} (${framework.version})`,
    `**Project source:** ${project.source}${project.sourceRef ? ` — ${project.sourceRef}` : ""}`,
    project.github?.fullName
      ? `**GitHub repository:** \`${project.github.fullName}\``
      : "",
    ``,
    `## Summary`,
    ``,
    `| Status | Count |`,
    `| --- | ---: |`,
    `| Passed | ${counts.passed} |`,
    `| Failed | ${counts.failed} |`,
    `| Needs review | ${counts.needs_review} |`,
    `| Not applicable | ${counts.not_applicable} |`,
    `| Unable to verify | ${counts.unable_to_verify} |`,
    ``,
    `| Findings | Count |`,
    `| --- | ---: |`,
    `| Open | ${openFindings.length} |`,
    `| Resolved | ${resolvedFindings.length} |`,
    `| Dismissed | ${dismissedFindings.length} |`,
    ``,
    `## Requirements`,
    ``,
  ];

  for (const control of controls) {
    const requirement = requirements.find(
      (candidate) => candidate.controlId === control.id,
    );
    if (!requirement) continue;
    lines.push(`### ${control.code} — ${control.title}`);
    lines.push(``);
    lines.push(`- **RGAA:** ${control.secondaryCode}`);
    lines.push(
      `- **Status:** ${requirementStatusLabel(requirement.status)} (${requirement.determination})`,
    );
    if (requirement.exception) {
      lines.push(
        `- **Exception:** ${requirement.exception.reason.replace(/_/g, " ")} — ${requirement.exception.note || "(no note)"} (${requirement.exception.at})`,
      );
    }
    lines.push(`- **Updated:** ${requirement.updatedAt}`);
    lines.push(`- ${control.description}`);
    lines.push(``);
  }

  lines.push(`## Findings`);
  lines.push(``);

  if (findings.length === 0) {
    lines.push(`_No findings recorded._`);
    lines.push(``);
  } else {
    for (const finding of findings) {
      const control = controlById(controls, finding.controlId);
      const remediation = remediations.find(
        (candidate) => candidate.findingId === finding.id,
      );
      lines.push(
        `### ${finding.status.toUpperCase()} — ${control?.code ?? finding.controlId} @ \`${formatLocationRef(finding.location)}\``,
      );
      lines.push(``);
      lines.push(`- **Kind / severity / confidence:** ${finding.kind} / ${finding.severity} / ${finding.confidence}`);
      lines.push(`- **Check:** \`${finding.checkId}\`${finding.engine ? ` · **Engine:** \`${finding.engine}\`` : ""}`);
      lines.push(`- **Reason:** ${finding.reason}`);
      if (remediation) {
        lines.push(`- **Remediation:** ${remediation.status}`);
        if (remediation.suggestion) {
          lines.push(
            `- **Suggestion (${remediation.suggestion.provenance}):** ${remediation.suggestion.description}`,
          );
        }
      }
      if (finding.dismissal) {
        lines.push(
          `- **Dismissal:** ${finding.dismissal.reason} — ${finding.dismissal.note || "(no note)"}`,
        );
      }
      if (finding.resolvedNote) {
        lines.push(`- **Resolution:** ${finding.resolvedNote}`);
      }
      lines.push(``);
      lines.push("```");
      lines.push(finding.location.snippet);
      lines.push("```");
      lines.push(``);
    }
  }

  lines.push(`## Evidence trail`);
  lines.push(``);
  const projectEvidence = evidence
    .filter((record) => record.projectId === project.id || !record.projectId)
    .slice()
    .reverse();

  if (projectEvidence.length === 0) {
    lines.push(`_No evidence recorded._`);
  } else {
    for (const record of projectEvidence) {
      lines.push(`- \`${record.at}\` · **${record.kind}** — ${record.summary}`);
    }
  }
  lines.push(``);
  lines.push(`---`);
  lines.push(
    `_Generated by ComplyLoop. Statuses come from deterministic checks or recorded human decisions; AI content is never the source of truth._`,
  );
  lines.push(``);

  return lines.join("\n");
}

/** Minimal HTML wrapper around the Markdown report for browser viewing/printing. */
export function buildComplianceReportHtml(markdown: string, projectName: string): string {
  const escaped = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Compliance report — ${projectName.replace(/</g, "")}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 52rem; margin: 2rem auto; padding: 0 1.25rem; color: #18181b; line-height: 1.5; }
    pre { white-space: pre-wrap; word-break: break-word; background: #f4f4f5; padding: 1rem 1.25rem; border-radius: 0.75rem; font-size: 0.875rem; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <pre>${escaped}</pre>
</body>
</html>`;
}
