import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import type { Control, Framework, Project, Requirement } from "@complyloop/domain/project-types";
import type { EvidenceRecord, Finding, Remediation } from "@complyloop/analysis-core/contract/finding-types";
import { controlDisplayCodes } from "@complyloop/adapters/control-theme";
import {
  determinationLabel,
  evidenceKindLabel,
  remediationStatusLabel,
  requirementStatusLabel,
  severityLabel,
} from "@/core/labels";
import { prioritizeClusters } from "@/core/prioritization";
import {
  formatLocationRef,
  locationSnippet,
} from "@complyloop/analysis-core/contract/location";

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

export function countRequirementsByStatus(
  requirements: Requirement[],
): Record<RequirementStatus, number> {
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

export interface ReportHeaderModel {
  title: string;
  projectName: string;
  frameworkName: string;
  frameworkVersion: string;
  sourceKind: string;
  sourceRef?: string;
  githubFullName?: string;
  exportedAt: string;
}

export interface ReportMetric {
  label: string;
  value: number;
}

export interface EngineeringFindingCard {
  code: string;
  locationRef: string;
  requirementLine?: string;
  severity: string;
  severityClass: string;
  confidence: string;
  checkId: string;
  engine?: string;
  reason: string;
  snippet: string;
  remediationStatus?: string;
  suggestion?: { provenance: string; description: string };
}

export interface EngineeringReportModel {
  header: ReportHeaderModel;
  metrics: ReportMetric[];
  clusters: { label: string; findingCount: number }[];
  findings: EngineeringFindingCard[];
}

export interface AuditRequirementRow {
  code: string;
  title: string;
  secondaryLabel: string;
  secondaryCode: string;
  status: RequirementStatus;
  statusLabel: string;
  determination: string;
  determinationLabel: string;
  description: string;
  updatedAt: string;
  exception?: { reason: string; note: string; at: string };
}

export interface AuditEvidenceRow {
  at: string;
  kindLabel: string;
  summary: string;
}

export interface AuditReportModel {
  header: ReportHeaderModel;
  statusCounts: Record<RequirementStatus, number>;
  findingCounts: { open: number; resolved: number; dismissed: number };
  totalRequirements: number;
  passRate: number;
  requirements: AuditRequirementRow[];
  evidence: AuditEvidenceRow[];
}

function reportHeader(title: string, input: ReportInput): ReportHeaderModel {
  return {
    title,
    projectName: input.project.name,
    frameworkName: input.framework.name,
    frameworkVersion: input.framework.version,
    sourceKind: input.project.source,
    sourceRef: input.project.sourceRef,
    githubFullName: input.project.github?.fullName,
    exportedAt: input.exportedAt,
  };
}

function secondaryReferenceLabel(secondaryCode: string): string {
  if (secondaryCode.startsWith("WCAG")) return "WCAG";
  if (secondaryCode.startsWith("RGAA")) return "RGAA";
  return "Also";
}

export function composeEngineeringReport(
  input: ReportInput,
): EngineeringReportModel {
  const { framework, controls, requirements, findings, remediations } = input;
  const openFindings = findings.filter((finding) => finding.status === "open");
  const clusters = prioritizeClusters(openFindings, controls);

  return {
    header: reportHeader("Engineering report", input),
    metrics: [
      { label: "Open findings", value: openFindings.length },
      { label: "Shared root causes", value: clusters.length },
    ],
    clusters: clusters.map((cluster) => ({
      label: cluster.label,
      findingCount: cluster.findingIds.length,
    })),
    findings: openFindings.map((finding) => {
      const control = controls.find((candidate) => candidate.id === finding.controlId);
      const requirement = requirements.find(
        (candidate) => candidate.controlId === finding.controlId,
      );
      const remediation = remediations.find(
        (candidate) => candidate.findingId === finding.id,
      );
      const display = control
        ? controlDisplayCodes(control, framework.id)
        : undefined;
      return {
        code: display?.code ?? control?.code ?? finding.controlId,
        locationRef: formatLocationRef(finding.location),
        requirementLine: requirement
          ? `${requirementStatusLabel(requirement.status)} (${requirement.determination})`
          : undefined,
        severity: severityLabel(finding.severity),
        severityClass: finding.severity,
        confidence: finding.confidence,
        checkId: finding.checkId,
        engine: finding.engine,
        reason: finding.reason,
        snippet: locationSnippet(finding.location),
        remediationStatus: remediation
          ? remediationStatusLabel(remediation.status)
          : undefined,
        suggestion: remediation?.suggestion
          ? {
              provenance: remediation.suggestion.provenance,
              description: remediation.suggestion.description,
            }
          : undefined,
      };
    }),
  };
}

export function composeAuditReport(input: ReportInput): AuditReportModel {
  const { framework, controls, requirements, findings, evidence, project } =
    input;
  const counts = countRequirementsByStatus(requirements);
  const openFindings = findings.filter((finding) => finding.status === "open");
  const totalRequirements = requirements.length;

  return {
    header: reportHeader("Audit report", input),
    statusCounts: counts,
    findingCounts: {
      open: openFindings.length,
      resolved: findings.filter((finding) => finding.status === "resolved").length,
      dismissed: findings.filter((finding) => finding.status === "dismissed")
        .length,
    },
    totalRequirements,
    passRate:
      totalRequirements > 0
        ? Math.round((counts.passed / totalRequirements) * 100)
        : 0,
    requirements: controls.flatMap((control) => {
      const requirement = requirements.find(
        (candidate) => candidate.controlId === control.id,
      );
      if (!requirement) return [];
      const display = controlDisplayCodes(control, framework.id);
      return [
        {
          code: display.code,
          title: control.title,
          secondaryLabel: secondaryReferenceLabel(display.secondaryCode),
          secondaryCode: display.secondaryCode,
          status: requirement.status,
          statusLabel: requirementStatusLabel(requirement.status),
          determination: requirement.determination,
          determinationLabel: determinationLabel(requirement.determination),
          description: control.description,
          updatedAt: requirement.updatedAt,
          exception: requirement.exception
            ? {
                reason: requirement.exception.reason.replace(/_/g, " "),
                note: requirement.exception.note || "(no note)",
                at: requirement.exception.at,
              }
            : undefined,
        },
      ];
    }),
    evidence: evidence
      .filter((record) => record.projectId === project.id || !record.projectId)
      .slice()
      .reverse()
      .map((record) => ({
        at: record.at,
        kindLabel: evidenceKindLabel(record.kind),
        summary: record.summary,
      })),
  };
}
