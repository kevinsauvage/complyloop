import type { RequirementStatus } from "@/core/statuses";
import type { Control, Framework, Project, Requirement } from "@/core/project-types";
import type { EvidenceRecord, Finding, Remediation } from "@/core/finding-types";
import { controlDisplayCodes } from "@/adapters/control-theme";
import { presetById } from "@/adapters/registry";
import { formatLocationRef } from "@/core/location";
import { requirementStatusLabel } from "@/core/labels";
import type { Db } from "./db";
import {
  evidenceForProject,
  findingsForProject,
  requirementsForProject,
} from "./project-visibility";

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

/** Resolves the framework named by the project's assessment preset. */
export function frameworkForProject(
  db: Db,
  project: Project,
): Framework {
  const preset = project.assessmentPresetId
    ? presetById(project.assessmentPresetId)
    : undefined;
  if (preset) {
    const fromPreset = db.frameworks.find(
      (framework) => framework.id === preset.frameworkId,
    );
    if (fromPreset) return fromPreset;
  }
  const fallback = db.frameworks[0];
  if (!fallback) {
    throw new Error("No compliance framework is configured.");
  }
  return fallback;
}

function secondaryReferenceLabel(secondaryCode: string): string {
  if (secondaryCode.startsWith("WCAG")) return "WCAG";
  if (secondaryCode.startsWith("RGAA")) return "RGAA";
  return "Also";
}

/** Builds report input for a project's current store snapshot. */
export function reportInputForProject(db: Db, project: Project): ReportInput {
  const findings = findingsForProject(db.findings, project.id);
  const framework = frameworkForProject(db, project);
  return {
    project,
    framework,
    controls: db.controls,
    requirements: requirementsForProject(db.requirements, project.id),
    findings,
    remediations: db.remediations.filter((remediation) =>
      findings.some((finding) => finding.id === remediation.findingId),
    ),
    evidence: evidenceForProject(db.evidence, project.id),
    exportedAt: new Date().toISOString(),
  };
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
    const display = controlDisplayCodes(control, framework.id);
    lines.push(`### ${display.code} — ${control.title}`);
    lines.push(``);
    lines.push(
      `- **${secondaryReferenceLabel(display.secondaryCode)}:** ${display.secondaryCode}`,
    );
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
      const display = control
        ? controlDisplayCodes(control, framework.id)
        : undefined;
      lines.push(
        `### ${finding.status.toUpperCase()} — ${display?.code ?? control?.code ?? finding.controlId} @ \`${formatLocationRef(finding.location)}\``,
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

